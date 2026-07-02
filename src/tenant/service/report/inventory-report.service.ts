import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, In } from 'typeorm';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import {
  Product,
  ProductFlavour,
  ProductPricing,
} from 'src/tenant-db/entities/product.entity';
import {
  ReferenceType,
  StockBalance,
  StockMovement,
  StockMovementType,
} from 'src/tenant-db/entities/stock.entity';
import { ActivityLogService } from '../activity-log.service';
import { InventoryMovementDto } from '../../dto/report/inventory-movement.dto';
import { InventoryOverviewDto } from '../../dto/report/inventory-overview.dto';

type AggregatedStockRow = {
  productId: string;
  uomId: string;
  quantityOnHand: string;
  quantityAvailable: string;
  quantityReserved: string;
  quantityDamaged: string;
};

type MovementGraphRow = {
  date: string;
  stockIn: string;
  stockOut: string;
};

@Injectable()
export class InventoryReportService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private normalizePage(value?: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  private normalizeLimit(value?: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) {
      return 10;
    }
    return Math.min(Math.floor(n), 100);
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private toNumber(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private resolveStockStatus(totalOnHand: number): 'IN_STOCK' | 'OUT_OF_STOCK' {
    return totalOnHand > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
  }

  private async validateDistributor(
    tenantDb: DataSource,
    distributorId: string,
  ): Promise<void> {
    const exists = await tenantDb.getRepository(Distributor).exist({
      where: { id: distributorId },
    });
    if (!exists) {
      throw new NotFoundException('Distributor not found');
    }
  }

  async getOverview(
    tenantDb: DataSource,
    filters: InventoryOverviewDto,
    user: { userId: string },
  ) {
    const page = this.normalizePage(filters.page);
    const limit = this.normalizeLimit(filters.limit);
    const distributorId = (filters.distributorId ?? '').trim() || null;
    const search = (filters.search ?? '').trim() || null;

    if (distributorId) {
      await this.validateDistributor(tenantDb, distributorId);
    }

    const aggregateQb = tenantDb
      .getRepository(StockBalance)
      .createQueryBuilder('sb')
      .innerJoin('sb.product', 'product')
      .select('sb.productId', 'productId')
      .addSelect('sb.uomId', 'uomId')
      .addSelect('COALESCE(SUM(sb.quantityOnHand), 0)', 'quantityOnHand')
      .addSelect('COALESCE(SUM(sb.quantityAvailable), 0)', 'quantityAvailable')
      .addSelect('COALESCE(SUM(sb.quantityReserved), 0)', 'quantityReserved')
      .addSelect('COALESCE(SUM(sb.quantityDamaged), 0)', 'quantityDamaged')
      .where('product.isDelete = :isDelete', { isDelete: false })
      .andWhere('product.isActive = :isActive', { isActive: true })
      .groupBy('sb.productId')
      .addGroupBy('sb.uomId');

    if (distributorId) {
      aggregateQb.andWhere('sb.distributorId = :distributorId', { distributorId });
    }

    if (search) {
      aggregateQb.andWhere(
        new Brackets((sub) => {
          sub
            .where('product.name ILIKE :search', { search: `%${search}%` })
            .orWhere('product."skuCode" ILIKE :search', { search: `%${search}%` });
        }),
      );
    }

    const aggregatedRows = (await aggregateQb.getRawMany()) as AggregatedStockRow[];
    if (!aggregatedRows.length) {
      return {
        filters: {
          distributorId,
          search,
        },
        summary: {
          totalStockProducts: 0,
          overallStockValue: 0,
          inStockProducts: 0,
          outOfStockProducts: 0,
        },
        products: [],
        pagination: {
          page,
          limit,
          total: 0,
        },
      };
    }

    const productIds = [...new Set(aggregatedRows.map((row) => row.productId))];

    const [products, pricings, flavourCounts] = await Promise.all([
      tenantDb.getRepository(Product).find({
        where: { id: In(productIds) },
        relations: ['category', 'brand'],
        order: { name: 'ASC' },
      }),
      tenantDb.getRepository(ProductPricing).find({
        where: { productId: In(productIds) },
        relations: ['uom'],
      }),
      tenantDb
        .getRepository(ProductFlavour)
        .createQueryBuilder('pf')
        .select('pf.productId', 'productId')
        .addSelect('COUNT(pf.id)::int', 'flavourCount')
        .where('pf.productId IN (:...productIds)', { productIds })
        .groupBy('pf.productId')
        .getRawMany<{ productId: string; flavourCount: string }>(),
    ]);

    const productMap = new Map(products.map((product) => [product.id, product]));
    const pricingMap = new Map(
      pricings.map((pricing) => [`${pricing.productId}:${pricing.uomId}`, pricing]),
    );
    const flavourCountMap = new Map(
      flavourCounts.map((row) => [row.productId, this.toNumber(row.flavourCount)]),
    );

    const rowsByProduct = new Map<string, AggregatedStockRow[]>();
    for (const row of aggregatedRows) {
      const existing = rowsByProduct.get(row.productId) ?? [];
      existing.push(row);
      rowsByProduct.set(row.productId, existing);
    }

    let overallStockValue = 0;
    let inStockProducts = 0;
    let outOfStockProducts = 0;

    const allProducts = productIds
      .map((productId) => {
        const product = productMap.get(productId);
        if (!product) {
          return null;
        }

        const uomRows = rowsByProduct.get(productId) ?? [];
        let productTotalOnHand = 0;
        let productStockValue = 0;

        const uomStocks = uomRows.map((row) => {
          const quantityOnHand = this.toNumber(row.quantityOnHand);
          const quantityAvailable = this.toNumber(row.quantityAvailable);
          const quantityReserved = this.toNumber(row.quantityReserved);
          const quantityDamaged = this.toNumber(row.quantityDamaged);
          const pricing = pricingMap.get(`${productId}:${row.uomId}`);
          const unitPrice = this.toNumber(pricing?.tradePrice);
          const stockValue = this.roundMoney(quantityOnHand * unitPrice);

          productTotalOnHand += quantityOnHand;
          productStockValue += stockValue;

          return {
            uomId: row.uomId,
            uom: pricing?.uom
              ? {
                  id: pricing.uom.id,
                  name: pricing.uom.name,
                }
              : null,
            quantityOnHand,
            quantityAvailable,
            quantityReserved,
            quantityDamaged,
            unitPrice,
            stockValue,
          };
        });

        productStockValue = this.roundMoney(productStockValue);
        overallStockValue += productStockValue;

        const stockStatus = this.resolveStockStatus(productTotalOnHand);
        if (stockStatus === 'IN_STOCK') {
          inStockProducts += 1;
        } else {
          outOfStockProducts += 1;
        }

        return {
          id: product.id,
          name: product.name,
          skuCode: product.skuCode,
          category: product.category
            ? {
                id: product.category.id,
                name: product.category.name,
              }
            : null,
          brand: product.brand
            ? {
                id: product.brand.id,
                name: product.brand.name,
              }
            : null,
          flavourCount: flavourCountMap.get(productId) ?? 0,
          stockStatus,
          uomStocks,
          totalStockValue: productStockValue,
        };
      })
      .filter((product): product is NonNullable<typeof product> => product !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    const total = allProducts.length;
    const paginatedProducts = allProducts.slice((page - 1) * limit, page * limit);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'INVENTORY_OVERVIEW_VIEWED',
      description: 'Inventory overview report viewed',
      metadata: {
        distributorId,
        search,
        totalStockProducts: total,
      },
    });

    return {
      filters: {
        distributorId,
        search,
      },
      summary: {
        totalStockProducts: total,
        overallStockValue: this.roundMoney(overallStockValue),
        inStockProducts,
        outOfStockProducts,
      },
      products: paginatedProducts,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }

  async getMovement(
    tenantDb: DataSource,
    filters: InventoryMovementDto,
    user: { userId: string },
  ) {
    const productId = filters.productId.trim();
    const distributorId = (filters.distributorId ?? '').trim() || null;
    const startDate = (filters.startDate ?? '').trim() || null;
    const endDate = (filters.endDate ?? '').trim() || null;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    if (distributorId) {
      await this.validateDistributor(tenantDb, distributorId);
    }

    const product = await tenantDb.getRepository(Product).findOne({
      where: { id: productId, isDelete: false },
      relations: ['category', 'brand'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const movementQb = tenantDb
      .getRepository(StockMovement)
      .createQueryBuilder('sm')
      .innerJoinAndSelect('sm.uom', 'uom')
      .innerJoinAndSelect('sm.productFlavour', 'productFlavour')
      .innerJoinAndSelect('productFlavour.flavour', 'flavour')
      .innerJoinAndSelect('sm.distributor', 'distributor')
      .where('sm.productId = :productId', { productId });

    if (distributorId) {
      movementQb.andWhere('sm.distributorId = :distributorId', { distributorId });
    }

    if (startDate) {
      movementQb.andWhere('sm."createdAt" >= :startDate', {
        startDate: `${startDate}T00:00:00.000Z`,
      });
    }

    if (endDate) {
      movementQb.andWhere('sm."createdAt" <= :endDate', {
        endDate: `${endDate}T23:59:59.999Z`,
      });
    }

    movementQb.orderBy('sm.createdAt', 'DESC');

    const movements = await movementQb.getMany();

    const graphQb = tenantDb
      .getRepository(StockMovement)
      .createQueryBuilder('sm')
      .select(`TO_CHAR(sm."createdAt", 'YYYY-MM-DD')`, 'date')
      .addSelect(
        `COALESCE(SUM(CASE WHEN sm.type = :inType THEN sm.quantity ELSE 0 END), 0)`,
        'stockIn',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN sm.type = :outType THEN sm.quantity ELSE 0 END), 0)`,
        'stockOut',
      )
      .where('sm.productId = :productId', { productId })
      .setParameter('inType', StockMovementType.IN)
      .setParameter('outType', StockMovementType.OUT)
      .groupBy(`TO_CHAR(sm."createdAt", 'YYYY-MM-DD')`)
      .orderBy(`TO_CHAR(sm."createdAt", 'YYYY-MM-DD')`, 'ASC');

    if (distributorId) {
      graphQb.andWhere('sm.distributorId = :distributorId', { distributorId });
    }

    if (startDate) {
      graphQb.andWhere('sm."createdAt" >= :startDate', {
        startDate: `${startDate}T00:00:00.000Z`,
      });
    }

    if (endDate) {
      graphQb.andWhere('sm."createdAt" <= :endDate', {
        endDate: `${endDate}T23:59:59.999Z`,
      });
    }

    const graphRows = (await graphQb.getRawMany()) as MovementGraphRow[];

    let totalIn = 0;
    let totalOut = 0;

    const movementList = movements.map((movement) => {
      if (movement.type === StockMovementType.IN) {
        totalIn += movement.quantity;
      } else {
        totalOut += movement.quantity;
      }

      return {
        id: movement.id,
        date: movement.createdAt,
        type: movement.type,
        quantity: movement.quantity,
        referenceType: movement.referenceType as ReferenceType,
        uom: {
          id: movement.uom.id,
          name: movement.uom.name,
        },
        flavour: movement.productFlavour?.flavour
          ? {
              id: movement.productFlavour.flavour.id,
              name: movement.productFlavour.flavour.name,
            }
          : null,
        distributor: {
          id: movement.distributor.id,
          name: movement.distributor.name,
        },
      };
    });

    const graph = graphRows.map((row) => {
      const stockIn = this.toNumber(row.stockIn);
      const stockOut = this.toNumber(row.stockOut);

      return {
        date: row.date,
        stockIn,
        stockOut,
        net: stockIn - stockOut,
      };
    });

    const flavourCount = await tenantDb.getRepository(ProductFlavour).count({
      where: { productId },
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'INVENTORY_MOVEMENT_VIEWED',
      description: 'Inventory movement report viewed',
      metadata: {
        productId,
        distributorId,
        startDate,
        endDate,
        movementCount: movementList.length,
      },
    });

    return {
      filters: {
        productId,
        distributorId,
        startDate,
        endDate,
      },
      product: {
        id: product.id,
        name: product.name,
        skuCode: product.skuCode,
        category: product.category
          ? {
              id: product.category.id,
              name: product.category.name,
            }
          : null,
        brand: product.brand
          ? {
              id: product.brand.id,
              name: product.brand.name,
            }
          : null,
        flavourCount,
      },
      summary: {
        totalIn,
        totalOut,
        netMovement: totalIn - totalOut,
        movementCount: movementList.length,
      },
      graph,
      movements: movementList,
    };
  }
}
