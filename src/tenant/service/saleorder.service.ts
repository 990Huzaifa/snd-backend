import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager } from 'typeorm';
import {
  OrderStatus,
  SaleOrder,
  SaleOrderItem,
} from 'src/tenant-db/entities/saleorder.entity';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { Retailer } from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { ProductFlavour, ProductPricing } from 'src/tenant-db/entities/product.entity';
import { Scheme, SchemeSlab } from 'src/tenant-db/entities/scheme.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateSaleOrderDto } from '../dto/saleorder/create-saleorder.dto';
import { UpdateSaleOrderDto } from '../dto/saleorder/update-saleorder.dto';
import { ReferenceType } from 'src/tenant-db/entities/stock.entity';
import { StockService } from './stock.service';
import { RefType } from 'src/tenant-db/entities/retailer.entity';
import { RetailerLedgerService } from './retailer/retailer-ledger.service';
import { ProductSchemeEngineService } from './product/product-scheme-engine.service';
import { RetailerSchemeEngineService } from './retailer/retailer-scheme-engine.service';

@Injectable()
export class SaleOrderService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
    private readonly retailerLedgerService: RetailerLedgerService,
    private readonly productSchemeEngineService: ProductSchemeEngineService,
    private readonly retailerSchemeEngineService: RetailerSchemeEngineService,
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

  private async generateOrderNumber(tenantDb: DataSource): Promise<string> {
    const repo = tenantDb.getRepository(SaleOrder);
    while (true) {
      const orderNumber = `SO${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`;
      const existing = await repo.findOne({
        where: { orderNumber },
        select: ['id'],
      });
      if (!existing) {
        return orderNumber;
      }
    }
  }

  private async assertForeignKeys(tenantDb: DataSource, dto: CreateSaleOrderDto | UpdateSaleOrderDto) {
    if (dto.distributorId) {
      const distributor = await tenantDb.getRepository(Distributor).findOne({
        where: { id: dto.distributorId, isDeleted: false },
        select: ['id'],
      });
      if (!distributor) throw new NotFoundException('Distributor not found');
    }

    if (dto.salesmanId) {
      const salesman = await tenantDb.getRepository(User).findOne({
        where: { id: dto.salesmanId, isDeleted: false },
        select: ['id'],
      });
      if (!salesman) throw new NotFoundException('Salesman not found');
    }

    if (dto.retailerId) {
      const retailer = await tenantDb.getRepository(Retailer).findOne({
        where: { id: dto.retailerId },
        select: ['id'],
      });
      if (!retailer) throw new NotFoundException('Retailer not found');
    }

    if (dto.routeId) {
      const route = await tenantDb.getRepository(Route).findOne({
        where: { id: dto.routeId },
        select: ['id'],
      });
      if (!route) throw new NotFoundException('Route not found');
    }

    if (dto.schemeId) {
      const scheme = await tenantDb.getRepository(Scheme).findOne({
        where: { id: dto.schemeId },
        select: ['id'],
      });
      if (!scheme) throw new NotFoundException('Scheme not found');
    }

    if (dto.schemeSlabId) {
      const slab = await tenantDb.getRepository(SchemeSlab).findOne({
        where: { id: dto.schemeSlabId },
        select: ['id'],
      });
      if (!slab) throw new NotFoundException('Scheme slab not found');
    }
  }

  private async assertItems(tenantDb: DataSource, items: CreateSaleOrderDto['items']) {
    for (const item of items) {
      const flavour = await tenantDb.getRepository(ProductFlavour).findOne({
        where: { id: item.productFlavourId.toString(), productId: item.productId.toString() },
        select: ['id'],
      });
      if (!flavour) {
        throw new BadRequestException(
          `Product flavour ${item.productFlavourId} is not valid for product ${item.productId}`,
        );
      }

      const pricing = await tenantDb.getRepository(ProductPricing).findOne({
        where: { id: item.productPricingId, productId: item.productId },
        select: ['id'],
      });
      if (!pricing) {
        throw new BadRequestException(
          `Product pricing ${item.productPricingId} is not valid for product ${item.productId}`,
        );
      }

      if (item.schemeId) {
        const scheme = await tenantDb.getRepository(Scheme).findOne({
          where: { id: item.schemeId },
          select: ['id'],
        });
        if (!scheme) throw new NotFoundException(`Scheme ${item.schemeId} not found`);
      }

      if (item.slabId) {
        const slab = await tenantDb.getRepository(SchemeSlab).findOne({
          where: { id: item.slabId },
          select: ['id'],
        });
        if (!slab) throw new NotFoundException(`Scheme slab ${item.slabId} not found`);
      }
    }
  }

  private isExecutionStatus(status: OrderStatus | string | undefined): boolean {
    if (!status) {
      return false;
    }
    return status === OrderStatus.APPROVED || String(status).toUpperCase() === 'EXECUTE';
  }

  private isReservationStatus(status: OrderStatus | string | undefined): boolean {
    return status === OrderStatus.PENDING;
  }

  private isReleaseStatus(status: OrderStatus): boolean {
    return status === OrderStatus.REJECTED || status === OrderStatus.CANCELLED;
  }

  private stockLineKey(item: {
    productId: string;
    productFlavourId: string | number;
    productPricingId: string;
  }): string {
    return `${item.productId}:${item.productFlavourId}:${item.productPricingId}`;
  }

  private mapItemsForStock(
    items: Array<{
      productId: string;
      productFlavourId: string | number;
      productPricingId: string;
      quantity: number;
    }>,
  ) {
    return items.map((item) => ({
      productId: item.productId.toString(),
      productFlavourId: item.productFlavourId.toString(),
      productPricingId: item.productPricingId.toString(),
      quantity: item.quantity,
    }));
  }

  private diffOrderItems(
    oldItems: Array<{
      productId: string;
      productFlavourId: string;
      productPricingId: string;
      quantity: number;
    }>,
    newItems: Array<{
      productId: string;
      productFlavourId: string;
      productPricingId: string;
      quantity: number;
    }>,
  ) {
    const oldMap = new Map<string, number>();
    for (const item of oldItems) {
      const key = this.stockLineKey(item);
      oldMap.set(key, (oldMap.get(key) ?? 0) + item.quantity);
    }

    const newMap = new Map<string, number>();
    for (const item of newItems) {
      const key = this.stockLineKey(item);
      newMap.set(key, (newMap.get(key) ?? 0) + item.quantity);
    }

    const toRelease: Array<{
      productId: string;
      productFlavourId: string;
      productPricingId: string;
      quantity: number;
    }> = [];
    const toReserve: Array<{
      productId: string;
      productFlavourId: string;
      productPricingId: string;
      quantity: number;
    }> = [];

    const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const key of allKeys) {
      const oldQty = oldMap.get(key) ?? 0;
      const newQty = newMap.get(key) ?? 0;
      const diff = newQty - oldQty;
      if (diff === 0) {
        continue;
      }

      const [productId, productFlavourId, productPricingId] = key.split(':');
      if (diff < 0) {
        toRelease.push({
          productId,
          productFlavourId,
          productPricingId,
          quantity: -diff,
        });
      } else {
        toReserve.push({
          productId,
          productFlavourId,
          productPricingId,
          quantity: diff,
        });
      }
    }

    return { toRelease, toReserve };
  }

  private async executeSaleOrder(manager: EntityManager, saleOrderId: string) {
    const order = await manager.getRepository(SaleOrder).findOne({
      where: { id: saleOrderId },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    if (!order.items?.length) {
      throw new BadRequestException('Sale order has no items to execute');
    }

    await this.stockService.fulfillReservedStock(manager, {
      distributorId: order.distributorId,
      items: this.mapItemsForStock(order.items),
      referenceType: ReferenceType.SALE,
    });

    await this.retailerLedgerService.createDebitEntry(manager, {
      retailerId: order.retailerId,
      refType: RefType.SALE,
      amount: Number(order.totalAmount ?? 0),
    });
  }

  async list(
    tenantDb: DataSource,
    pageInput: number,
    limitInput: number,
    search: string,
    user: { userId: string },
    status: string,
  ) {
    const page = this.normalizePage(pageInput);
    const limit = this.normalizeLimit(limitInput);

    const qb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.retailer', 'retailer')
      .leftJoinAndSelect('so.distributor', 'distributor')
      .leftJoinAndSelect('so.salesman', 'salesman');

    const normalizedSearch = (search ?? '').trim();
    if (normalizedSearch) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('so."orderNumber" ILIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('retailer."shopName" ILIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('distributor.name ILIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('salesman.name ILIKE :search', { search: `%${normalizedSearch}%` });
        }),
      );
    }

    if (status) {
      qb.andWhere('so."orderStatus" = :status', { status: status.trim() });
    }

    const total = await qb.clone().getCount();
    const orders = await qb
      .clone()
      .select([
        'so.id',
        'so.orderNumber',
        'retailer.shopName',
        'retailer.id',
        'salesman.name',
        'distributor.name',
        'so.orderDate',
        'so.totalAmount',
        'so.createdAt',
        'so.executedDate',
        'so.deliveredDate',
        'distributor.id',
        'so.orderStatus',
        'salesman.id',
      ])
      .orderBy('so.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_ORDER_LISTED',
      description: 'Sale orders listed',
      metadata: { total, page, limit },
    });

    return {
      result: orders,
      meta: { total, page, limit },
    };
  }

  async view(tenantDb: DataSource, id: string, user: { userId: string }) {
    const order = await tenantDb.getRepository(SaleOrder).findOne({
      where: { id },
      relations: [
        'distributor',
        'salesman',
        'retailer',
        'route',
        'scheme',
        'schemeSlab',
        'items',
        'items.product',
        'items.productFlavour',
        'items.productFlavour.flavour',
        'items.productPricing',
        'items.productPricing.uom',
        'items.scheme',
        'items.slab',
      ],
    });

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_ORDER_VIEWED',
      description: `Sale order ${order.orderNumber} viewed`,
      metadata: { saleOrderId: order.id },
    });

    return order;
  }

  async create(tenantDb: DataSource, dto: CreateSaleOrderDto, user: { userId: string }) {
    await this.assertForeignKeys(tenantDb, dto);
    await this.assertItems(tenantDb, dto.items);

    const saleOrderId = await tenantDb.transaction(async (manager) => {
      const orderRepo = manager.getRepository(SaleOrder);
      const itemRepo = manager.getRepository(SaleOrderItem);

      const order = await orderRepo.save(
        orderRepo.create({
          orderNumber: await this.generateOrderNumber(tenantDb),
          distributorId: dto.distributorId,
          salesmanId: dto.salesmanId,
          retailerId: dto.retailerId,
          routeId: dto.routeId,
          orderStatus: dto.orderStatus ?? OrderStatus.PENDING,
          orderTotal: dto.orderTotal,
          taxPercentage: dto.taxPercentage ?? 0,
          taxAmount: dto.taxAmount ?? 0,
          discountPercentage: dto.discountPercentage ?? 0,
          discountAmount: dto.discountAmount ?? 0,
          totalAmount: dto.totalAmount,
          schemeId: dto.schemeId ?? null,
          schemeSlabId: dto.schemeSlabId ?? null,
          notes: dto.notes?.trim() || null,
          orderDate: new Date(dto.orderDate),
          executedDate: dto.executedDate ? new Date(dto.executedDate) : null,
          deliveredDate: dto.deliveredDate ? new Date(dto.deliveredDate) : null,
        }),
      );

      await itemRepo.save(
        dto.items.map((item) =>
          itemRepo.create({
            saleOrderId: order.id,
            productId: item.productId.toString(),
            productFlavourId: item.productFlavourId.toString(),
            productPricingId: item.productPricingId.toString(),
            schemeId: item.schemeId ?? null,
            slabId: item.slabId ?? null,
            quantity: item.quantity,
            discountPercentage: item.discountPercentage ?? 0,
            discountAmount: item.discountAmount ?? 0,
            totalAmount: item.totalAmount,
          }),
        ),
      );

      const stockItems = this.mapItemsForStock(dto.items);

      if (this.isReservationStatus(order.orderStatus)) {
        await this.stockService.reserveStock(manager, {
          distributorId: order.distributorId,
          items: stockItems,
        });
      }

      if (this.isExecutionStatus(order.orderStatus)) {
        await this.stockService.reserveStock(manager, {
          distributorId: order.distributorId,
          items: stockItems,
        });
        await this.executeSaleOrder(manager, order.id);
      }

      return order.id;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_ORDER_CREATED',
      description: 'Sale order created',
      metadata: { saleOrderId, distributorId: dto.distributorId },
    });

    return this.view(tenantDb, saleOrderId, user);
  }

  async edit(
    tenantDb: DataSource,
    id: string,
    dto: UpdateSaleOrderDto,
    user: { userId: string },
  ) {
    const existing = await tenantDb.getRepository(SaleOrder).findOne({
      where: { id },
      relations: ['items'],
    });
    if (!existing) {
      throw new NotFoundException('Sale order not found');
    }

    if (existing.orderStatus !== OrderStatus.PENDING) {
      throw new BadRequestException('Sale order is not pending');
    }

    if (dto.orderStatus !== undefined && dto.orderStatus !== existing.orderStatus) {
      throw new BadRequestException('Order status can only be changed via updateStatus');
    }

    await this.assertForeignKeys(tenantDb, dto);
    if (dto.items) {
      await this.assertItems(tenantDb, dto.items);
    }

    await tenantDb.transaction(async (manager) => {
      const orderRepo = manager.getRepository(SaleOrder);
      const itemRepo = manager.getRepository(SaleOrderItem);

      const distributorChanged =
        dto.distributorId !== undefined && dto.distributorId !== existing.distributorId;
      const newDistributorId = dto.distributorId ?? existing.distributorId;

      if (distributorChanged) {
        await this.stockService.releaseStock(manager, {
          distributorId: existing.distributorId,
          items: this.mapItemsForStock(existing.items),
        });
      }

      if (dto.items) {
        if (distributorChanged) {
          await this.stockService.reserveStock(manager, {
            distributorId: newDistributorId,
            items: this.mapItemsForStock(dto.items),
          });
        } else {
          const { toRelease, toReserve } = this.diffOrderItems(
            this.mapItemsForStock(existing.items),
            this.mapItemsForStock(dto.items),
          );

          if (toRelease.length) {
            await this.stockService.releaseStock(manager, {
              distributorId: existing.distributorId,
              items: toRelease,
            });
          }

          if (toReserve.length) {
            await this.stockService.reserveStock(manager, {
              distributorId: existing.distributorId,
              items: toReserve,
            });
          }
        }
      } else if (distributorChanged) {
        await this.stockService.reserveStock(manager, {
          distributorId: newDistributorId,
          items: this.mapItemsForStock(existing.items),
        });
      }

      await orderRepo.update(id, {
        distributorId: dto.distributorId,
        salesmanId: dto.salesmanId,
        retailerId: dto.retailerId,
        routeId: dto.routeId,
        orderTotal: dto.orderTotal,
        taxPercentage: dto.taxPercentage,
        taxAmount: dto.taxAmount,
        discountPercentage: dto.discountPercentage,
        discountAmount: dto.discountAmount,
        totalAmount: dto.totalAmount,
        schemeId: dto.schemeId,
        schemeSlabId: dto.schemeSlabId,
        notes: dto.notes?.trim(),
        orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
        executedDate: dto.executedDate ? new Date(dto.executedDate) : undefined,
        deliveredDate: dto.deliveredDate ? new Date(dto.deliveredDate) : undefined,
      });

      if (dto.items) {
        await itemRepo.delete({ saleOrderId: id });
        await itemRepo.save(
          dto.items.map((item) =>
            itemRepo.create({
              saleOrderId: id,
              productId: item.productId.toString(),
              productFlavourId: item.productFlavourId.toString(),
              productPricingId: item.productPricingId.toString(),
              schemeId: item.schemeId ?? null,
              slabId: item.slabId ?? null,
              quantity: item.quantity,
              discountPercentage: item.discountPercentage ?? 0,
              discountAmount: item.discountAmount ?? 0,
              totalAmount: item.totalAmount,
            }),
          ),
        );
      }
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_ORDER_UPDATED',
      description: `Sale order ${existing.orderNumber} updated`,
      metadata: { saleOrderId: id },
    });

    return this.view(tenantDb, id, user);
  }

  async updateStatus(tenantDb: DataSource, id: string, status: OrderStatus, user: { userId: string }) {
    let order: Pick<SaleOrder, 'id' | 'orderNumber' | 'orderStatus'> | null = null;

    await tenantDb.transaction(async (manager) => {
      const orderRepo = manager.getRepository(SaleOrder);
      const currentOrder = await orderRepo.findOne({
        where: { id },
        select: ['id', 'orderNumber', 'orderStatus'],
      });
      if (!currentOrder) {
        throw new NotFoundException('Sale order not found');
      }

      const wasExecutionStatus = this.isExecutionStatus(currentOrder.orderStatus);
      const wasReservationStatus = this.isReservationStatus(currentOrder.orderStatus);

      if (this.isReleaseStatus(status) && wasReservationStatus) {
        const orderWithItems = await orderRepo.findOne({
          where: { id: currentOrder.id },
          relations: ['items'],
        });
        if (orderWithItems?.items?.length) {
          await this.stockService.releaseStock(manager, {
            distributorId: orderWithItems.distributorId,
            items: this.mapItemsForStock(orderWithItems.items),
          });
        }
      }

      currentOrder.orderStatus = status;
      await orderRepo.save(currentOrder);

      if (this.isExecutionStatus(status) && !wasExecutionStatus) {
        await this.executeSaleOrder(manager, currentOrder.id);
      }

      order = currentOrder;
    });

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_ORDER_STATUS_UPDATED',
      description: `Sale order ${order.orderNumber} status updated to ${status}`,
      metadata: { saleOrderId: order.id, status },
    });

    return {
      message: 'Sale order status updated successfully',
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
      },
    };
  }

  async getEligibleProductSchemes(
    tenantDb: DataSource,
    input: {
      productId: string;
      productPricingId: string;
      quantity: number;
      orderDate: string | Date;
    },
  ) {
    return this.productSchemeEngineService.listEligibleSchemesForProduct(tenantDb, {
      productId: input.productId,
      productPricingId: input.productPricingId,
      quantity: input.quantity,
      orderDate: new Date(input.orderDate),
    });
  }

  async getEligibleRetailerSchemes(
    tenantDb: DataSource,
    input: {
      retailerId: string;
      orderDate: string | Date;
      orderTotal: number;
    },
  ) {
    return this.retailerSchemeEngineService.listEligibleSchemesForRetailer(tenantDb, {
      retailerId: input.retailerId,
      orderDate: new Date(input.orderDate),
      orderTotal: input.orderTotal,
    });
  }
}
