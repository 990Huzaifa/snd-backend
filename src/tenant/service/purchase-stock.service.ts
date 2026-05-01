import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import {
  PurchaseStock,
  PurchaseStockItem,
} from 'src/tenant-db/entities/purchase-stock.entity';
import { ProductFlavour, ProductPricing } from 'src/tenant-db/entities/product.entity';
import { ReferenceType, StockMovementType } from 'src/tenant-db/entities/stock.entity';
import { ActivityLogService } from './activity-log.service';
import { CreatePurchaseStockDto } from '../dto/purchase-stock/create-purchase-stock.dto';
import { StockService } from './stock.service';

@Injectable()
export class PurchaseStockService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
  ) {}

  private normalizePage(value: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  private normalizeLimit(value: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) {
      return 10;
    }
    return Math.min(Math.floor(n), 100);
  }

  async list(
    tenantDb: DataSource,
    pageInput: number,
    limitInput: number,
    search: string,
    user: { userId: string },
  ) {
    const page = this.normalizePage(pageInput);
    const limit = this.normalizeLimit(limitInput);
    const repo = tenantDb.getRepository(PurchaseStock);

    const baseQb = repo
      .createQueryBuilder('ps')
      .innerJoin('ps.distributor', 'd');

    const normalizedSearch = (search ?? '').trim();
    if (normalizedSearch) {
      baseQb.andWhere(
        new Brackets((sub) => {
          sub
            .where('d.name ILIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('ps.remarks ILIKE :search', { search: `%${normalizedSearch}%` });
        }),
      );
    }

    const total = await baseQb.clone().getCount();

    const rawRows = await baseQb
      .clone()
      .select('ps.id', 'id')
      .addSelect('ps."purchaseDate"', 'date')
      .addSelect('ps.remarks', 'remarks')
      .addSelect('ps."createdAt"', 'createdAt')
      .addSelect('d.name', 'distributorName')
      .addSelect(
        '(SELECT COUNT(DISTINCT i."productId")::int FROM purchase_stock_items i WHERE i."purchaseStockId" = ps.id)',
        'totalProducts',
      )
      .addSelect(
        '(SELECT COALESCE(SUM(i.quantity), 0)::int FROM purchase_stock_items i WHERE i."purchaseStockId" = ps.id)',
        'totalQuantity',
      )
      .orderBy('ps."createdAt"', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    const result = rawRows.map((row) => ({
      id: row.id,
      distributorName: row.distributorName,
      date: row.date,
      remarks: row.remarks,
      totalProducts: Number(row.totalProducts) || 0,
      totalQuantity: Number(row.totalQuantity) || 0,
      createdAt: row.createdAt,
    }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PURCHASE_STOCK_LISTED',
      description: 'Purchase stocks listed',
      metadata: { total, page, limit },
    });

    return { result, meta: { total, page, limit } };
  }

  async view(
    tenantDb: DataSource,
    id: string,
    user: { userId: string },
    options?: { recordActivityLog?: boolean },
  ) {
    const recordActivityLog = options?.recordActivityLog !== false;

    const stock = await tenantDb.getRepository(PurchaseStock).findOne({
      where: { id },
      relations: [
        'distributor',
        'items',
        'items.product',
        'items.productFlavour',
        'items.productFlavour.flavour',
        'items.productPricing',
        'items.productPricing.uom',
      ],
    });

    if (!stock) {
      throw new NotFoundException('Purchase stock not found');
    }

    const productIds = new Set(stock.items.map((i) => i.productId));
    const totalQuantity = stock.items.reduce((sum, i) => sum + i.quantity, 0);

    const lineItems = stock.items.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      product: line.product
        ? {
            id: line.product.id,
            name: line.product.name,
            skuCode: line.product.skuCode,
          }
        : null,
      flavour: line.productFlavour?.flavour
        ? {
            id: line.productFlavour.flavour.id,
            name: line.productFlavour.flavour.name,
          }
        : null,
      pricing: line.productPricing
        ? {
            id: line.productPricing.id,
            tradePrice: line.productPricing.tradePrice,
            retailPrice: line.productPricing.retailPrice,
            uom: line.productPricing.uom
              ? { id: line.productPricing.uom.id, name: line.productPricing.uom.name }
              : null,
          }
        : null,
    }));

    if (recordActivityLog) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'PURCHASE_STOCK_VIEWED',
        description: 'Purchase stock viewed',
        metadata: { purchaseStockId: stock.id },
      });
    }

    return {
      id: stock.id,
      distributor: stock.distributor
        ? { id: stock.distributor.id, name: stock.distributor.name }
        : null,
      date: stock.purchaseDate,
      remarks: stock.remarks,
      totalProducts: productIds.size,
      totalQuantity,
      createdAt: stock.createdAt,
      updatedAt: stock.updatedAt,
      items: lineItems,
    };
  }

  async create(
    tenantDb: DataSource,
    dto: CreatePurchaseStockDto,
    user: { userId: string },
  ) {
    const distributor = await tenantDb.getRepository(Distributor).findOne({
      where: { id: dto.distributorId, isDeleted: false },
    });
    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }

    for (const line of dto.items) {
      const flavour = await tenantDb.getRepository(ProductFlavour).findOne({
        where: { id: line.productFlavourId.toString(), productId: line.productId },
        select: ['id'],
      });
      if (!flavour) {
        throw new BadRequestException(
          `Product flavour ${line.productFlavourId} is not valid for product ${line.productId}`,
        );
      }

      const pricing = await tenantDb.getRepository(ProductPricing).findOne({
        where: { id: line.productPricingId, productId: line.productId },
        select: ['id'],
      });
      if (!pricing) {
        throw new BadRequestException(
          `Product pricing ${line.productPricingId} is not valid for product ${line.productId}`,
        );
      }
    }

    const stockId = await tenantDb.transaction(async (manager) => {
      const stockRepo = manager.getRepository(PurchaseStock);
      const itemRepo = manager.getRepository(PurchaseStockItem);

      const stock = await stockRepo.save(
        stockRepo.create({
          distributorId: dto.distributorId,
          remarks: dto.remarks.trim(),
          purchaseDate: new Date(dto.date),
        }),
      );

      await itemRepo.save(
        dto.items.map((line) =>
          itemRepo.create({
            purchaseStockId: stock.id,
            productId: line.productId,
            productFlavourId: line.productFlavourId.toString(),
            productPricingId: line.productPricingId,
            quantity: Number(line.quantity),
          }),
        ),
      );

      for (const line of dto.items) {
        await this.stockService.applyStockMovement(manager, {
          distributorId: dto.distributorId,
          productId: line.productId,
          productFlavourId: line.productFlavourId.toString(),
          productPricingId: line.productPricingId,
          quantity: Number(line.quantity),
          type: StockMovementType.IN,
          referenceType: ReferenceType.PURCHASE,
        });
      }

      return stock.id;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PURCHASE_STOCK_CREATED',
      description: 'Purchase stock created',
      metadata: { purchaseStockId: stockId, distributorId: dto.distributorId },
    });

    return this.view(tenantDb, stockId, user);
  }
}
