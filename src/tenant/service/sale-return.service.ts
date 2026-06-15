import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Brackets, DataSource, EntityManager } from 'typeorm';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { ProductFlavour, ProductPricing } from 'src/tenant-db/entities/product.entity';
import { RefType, Retailer } from 'src/tenant-db/entities/retailer.entity';
import {
  ReturnStatus,
  ReturnType,
  SaleReturn,
  SaleReturnItem,
} from 'src/tenant-db/entities/sale-return.entity';
import { OrderStatus, SaleOrder, SaleOrderItem } from 'src/tenant-db/entities/saleorder.entity';
import { ReferenceType, StockMovementType } from 'src/tenant-db/entities/stock.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { ActivityLogService } from './activity-log.service';
import { RetailerLedgerService } from './retailer/retailer-ledger.service';
import { StockService } from './stock.service';
import { CreateSaleReturnDto } from '../dto/sale-return/create-sale-return.dto';
import { CreateSaleReturnItemDto } from '../dto/sale-return/create-sale-return-item.dto';
import { UpdateSaleReturnDto } from '../dto/sale-return/update-sale-return.dto';
import { UpdateSaleReturnStatusDto } from '../dto/sale-return/update-sale-return-status.dto';

type ResolvedReturnItem = {
  productId: string;
  productFlavourId: string;
  productPricingId: string;
  orderedQuantity: number;
  returnedQuantity: number;
  total: number;
  returnReason: string;
};

@Injectable()
export class SaleReturnService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
    private readonly retailerLedgerService: RetailerLedgerService,
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

  private stockLineKey(item: {
    productId: string;
    productFlavourId: string | number;
    productPricingId: string;
  }): string {
    return `${item.productId}:${item.productFlavourId}:${item.productPricingId}`;
  }

  private isExecuted(saleReturn: Pick<SaleReturn, 'executedBy'>): boolean {
    return saleReturn.executedBy != null;
  }

  private isEditable(saleReturn: SaleReturn): boolean {
    return (
      saleReturn.returnStatus === ReturnStatus.PENDING &&
      !this.isExecuted(saleReturn)
    );
  }

  private isOrderExecuted(status: OrderStatus): boolean {
    return (
      status === OrderStatus.APPROVED ||
      status === OrderStatus.DELIVERED ||
      status === OrderStatus.PROCESSING
    );
  }

  private async nextReturnNumberWithManager(
    manager: EntityManager,
  ): Promise<string> {
    const repo = manager.getRepository(SaleReturn);
    for (let attempt = 0; attempt < 8; attempt++) {
      const returnNumber = `SR-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
      const exists = await repo.exist({ where: { returnNumber } });
      if (!exists) {
        return returnNumber;
      }
    }
    throw new BadRequestException('Could not allocate a unique return number');
  }

  private parseRetailerIds(raw?: string): string[] | undefined {
    if (raw === undefined || raw === null) {
      return undefined;
    }
    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.length ? ids : undefined;
  }

  private parseOptionalDayBoundary(iso?: string): Date | undefined {
    if (!iso?.trim()) {
      return undefined;
    }
    const d = new Date(iso.trim());
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${iso}`);
    }
    return d;
  }

  private parseOptionalReturnStatus(raw?: string): ReturnStatus | undefined {
    const s = raw?.trim();
    if (!s) {
      return undefined;
    }
    const allowed = Object.values(ReturnStatus) as string[];
    if (!allowed.includes(s)) {
      throw new BadRequestException(
        `Invalid status filter (use one of: ${allowed.join(', ')})`,
      );
    }
    return s as ReturnStatus;
  }

  private parseOptionalReturnType(raw?: string): ReturnType | undefined {
    const s = raw?.trim();
    if (!s) {
      return undefined;
    }
    const allowed = Object.values(ReturnType) as string[];
    if (!allowed.includes(s)) {
      throw new BadRequestException(
        `Invalid return type filter (use one of: ${allowed.join(', ')})`,
      );
    }
    return s as ReturnType;
  }

  private async assertItems(
    tenantDb: DataSource,
    items: CreateSaleReturnItemDto[],
  ) {
    for (const item of items) {
      const flavour = await tenantDb.getRepository(ProductFlavour).findOne({
        where: {
          id: item.productFlavourId.toString(),
          productId: item.productId.toString(),
        },
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
    }
  }

  private async resolveDistributorId(
    manager: EntityManager,
    saleReturn: Pick<SaleReturn, 'returnType' | 'orderId' | 'retailerId'>,
  ): Promise<string> {
    if (saleReturn.returnType === ReturnType.ORDER) {
      if (!saleReturn.orderId) {
        throw new BadRequestException('Order id is required for order returns');
      }
      const order = await manager.getRepository(SaleOrder).findOne({
        where: { id: saleReturn.orderId },
        select: ['id', 'distributorId'],
      });
      if (!order) {
        throw new NotFoundException('Sale order not found');
      }
      return order.distributorId;
    }

    const retailer = await manager.getRepository(Retailer).findOne({
      where: { id: saleReturn.retailerId },
      relations: ['route'],
      select: {
        id: true,
        route: { id: true, distributorId: true },
      },
    });
    if (!retailer?.route?.distributorId) {
      throw new BadRequestException(
        'Could not resolve distributor for retailer return',
      );
    }

    const distributor = await manager.getRepository(Distributor).findOne({
      where: { id: retailer.route.distributorId, isDeleted: false },
      select: ['id'],
    });
    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }

    return retailer.route.distributorId;
  }

  private async getApprovedReturnedQuantities(
    manager: EntityManager,
    orderId: string,
    excludeReturnId?: string,
  ): Promise<Map<string, number>> {
    const qb = manager
      .getRepository(SaleReturnItem)
      .createQueryBuilder('item')
      .innerJoin('item.saleReturn', 'sr')
      .where('sr."orderId" = :orderId', { orderId })
      .andWhere('sr."returnStatus" = :status', { status: ReturnStatus.APPROVED });

    if (excludeReturnId) {
      qb.andWhere('sr.id != :excludeReturnId', { excludeReturnId });
    }

    const rows = await qb
      .select([
        'item."productId" AS "productId"',
        'item."productFlavourId" AS "productFlavourId"',
        'item."productPricingId" AS "productPricingId"',
        'item."returnedQuantity" AS "returnedQuantity"',
      ])
      .getRawMany<{
        productId: string;
        productFlavourId: string;
        productPricingId: string;
        returnedQuantity: string;
      }>();

    const totals = new Map<string, number>();
    for (const row of rows) {
      const key = this.stockLineKey(row);
      totals.set(
        key,
        (totals.get(key) ?? 0) + Number(row.returnedQuantity ?? 0),
      );
    }
    return totals;
  }

  private async resolveReturnItems(
    manager: EntityManager,
    input: {
      returnType: ReturnType;
      retailerId: string;
      orderId?: string | null;
      items: CreateSaleReturnItemDto[];
      excludeReturnId?: string;
    },
  ): Promise<ResolvedReturnItem[]> {
    if (input.returnType === ReturnType.RETAILER) {
      return input.items.map((item) => ({
        productId: item.productId.toString(),
        productFlavourId: item.productFlavourId.toString(),
        productPricingId: item.productPricingId.toString(),
        orderedQuantity: item.orderedQuantity ?? 0,
        returnedQuantity: item.returnedQuantity,
        total: item.total,
        returnReason: item.returnReason.trim(),
      }));
    }

    if (!input.orderId) {
      throw new BadRequestException('Order id is required for order returns');
    }

    const order = await manager.getRepository(SaleOrder).findOne({
      where: { id: input.orderId },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException('Sale order not found');
    }
    if (order.retailerId !== input.retailerId) {
      throw new BadRequestException(
        'Retailer does not match the linked sale order',
      );
    }
    if (!this.isOrderExecuted(order.orderStatus)) {
      throw new BadRequestException(
        'Sale order must be approved or delivered before creating a return',
      );
    }

    const orderItemMap = new Map<string, SaleOrderItem>();
    for (const orderItem of order.items ?? []) {
      orderItemMap.set(this.stockLineKey(orderItem), orderItem);
    }

    const alreadyReturned = await this.getApprovedReturnedQuantities(
      manager,
      input.orderId,
      input.excludeReturnId,
    );

    return input.items.map((item) => {
      const key = this.stockLineKey(item);
      const orderItem = orderItemMap.get(key);
      if (!orderItem) {
        throw new BadRequestException(
          `Product line ${key} is not part of the linked sale order`,
        );
      }

      const priorReturned = alreadyReturned.get(key) ?? 0;
      const remaining = orderItem.quantity - priorReturned;
      if (item.returnedQuantity > remaining) {
        throw new BadRequestException(
          `Returned quantity exceeds remaining quantity for product line ${key}`,
        );
      }

      return {
        productId: item.productId.toString(),
        productFlavourId: item.productFlavourId.toString(),
        productPricingId: item.productPricingId.toString(),
        orderedQuantity: orderItem.quantity,
        returnedQuantity: item.returnedQuantity,
        total: item.total,
        returnReason: item.returnReason.trim(),
      };
    });
  }

  private mapItemsForStock(items: ResolvedReturnItem[]) {
    return items.map((item) => ({
      productId: item.productId,
      productFlavourId: item.productFlavourId,
      productPricingId: item.productPricingId,
      quantity: item.returnedQuantity,
    }));
  }

  private async recordReturnApproval(
    manager: EntityManager,
    saleReturn: SaleReturn,
    items: ResolvedReturnItem[],
    actorUserId: string,
  ): Promise<void> {
    if (this.isExecuted(saleReturn)) {
      return;
    }

    const distributorId = await this.resolveDistributorId(manager, saleReturn);

    await this.stockService.applyOrderStockMovement(manager, {
      distributorId,
      items: this.mapItemsForStock(items),
      type: StockMovementType.IN,
      referenceType: ReferenceType.RETURN,
    });

    const amount = Number(saleReturn.returnAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid return amount for ledger posting');
    }

    await this.retailerLedgerService.createCreditEntry(manager, {
      retailerId: saleReturn.retailerId,
      refType: RefType.RETURN,
      amount,
    });

    saleReturn.executedBy = actorUserId;
    saleReturn.executedDate = new Date();
  }

  private async ensureRetailer(
    tenantDb: DataSource,
    retailerId: string,
  ): Promise<void> {
    const retailer = await tenantDb.getRepository(Retailer).findOne({
      where: { id: retailerId },
      select: ['id'],
    });
    if (!retailer) {
      throw new NotFoundException('Retailer not found');
    }
  }

  private async ensureUser(tenantDb: DataSource, userId: string): Promise<void> {
    const exists = await tenantDb.getRepository(User).findOne({
      where: { id: userId },
      select: ['id'],
    });
    if (!exists) {
      throw new NotFoundException('User not found');
    }
  }

  private assertReturnTypeConsistency(dto: {
    returnType?: ReturnType;
    orderId?: string | null;
  }) {
    if (dto.returnType === ReturnType.ORDER && !dto.orderId) {
      throw new BadRequestException('Order id is required for order returns');
    }
    if (dto.returnType === ReturnType.RETAILER && dto.orderId) {
      throw new BadRequestException(
        'Order id must not be set for retailer returns',
      );
    }
  }

  async create(
    tenantDb: DataSource,
    dto: CreateSaleReturnDto,
    user: { userId: string },
  ) {
    this.assertReturnTypeConsistency(dto);
    await this.ensureUser(tenantDb, user.userId);
    await this.ensureRetailer(tenantDb, dto.retailerId);
    await this.assertItems(tenantDb, dto.items);

    const initialStatus = dto.returnStatus ?? ReturnStatus.PENDING;

    const created = await tenantDb.transaction(async (manager) => {
      const resolvedItems = await this.resolveReturnItems(manager, {
        returnType: dto.returnType,
        retailerId: dto.retailerId,
        orderId: dto.orderId ?? null,
        items: dto.items,
      });

      const returnRepo = manager.getRepository(SaleReturn);
      const itemRepo = manager.getRepository(SaleReturnItem);
      const returnNumber = await this.nextReturnNumberWithManager(manager);

      const entity = returnRepo.create({
        returnNumber,
        returnType: dto.returnType,
        returnDate: new Date(dto.returnDate),
        retailerId: dto.retailerId,
        orderId: dto.returnType === ReturnType.ORDER ? dto.orderId! : null,
        note: dto.note?.trim() ?? null,
        returnAmount: dto.returnAmount,
        returnStatus: initialStatus,
      });

      const saved = await returnRepo.save(entity);

      await itemRepo.save(
        resolvedItems.map((item) =>
          itemRepo.create({
            saleReturnId: saved.id,
            productId: item.productId,
            productFlavourId: item.productFlavourId,
            productPricingId: item.productPricingId,
            orderedQuantity: item.orderedQuantity,
            returnedQuantity: item.returnedQuantity,
            total: item.total,
            retirnReason: item.returnReason,
          }),
        ),
      );

      if (initialStatus === ReturnStatus.APPROVED) {
        await this.recordReturnApproval(
          manager,
          saved,
          resolvedItems,
          user.userId,
        );
        await returnRepo.save(saved);
      }

      return { id: saved.id, returnNumber: saved.returnNumber };
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_RETURN_CREATED',
      description: 'Sale return created',
      metadata: {
        id: created.id,
        returnNumber: created.returnNumber,
        approved: initialStatus === ReturnStatus.APPROVED,
      },
    });

    return this.view(tenantDb, created.id, user, { recordActivityLog: false });
  }

  async view(
    tenantDb: DataSource,
    id: string,
    user: { userId: string },
    options?: { recordActivityLog?: boolean },
  ) {
    const recordActivityLog = options?.recordActivityLog !== false;

    const saleReturn = await tenantDb.getRepository(SaleReturn).findOne({
      where: { id },
      relations: [
        'retailer',
        'order',
        'order.distributor',
        'items',
        'items.product',
        'items.productFlavour',
        'items.productFlavour.flavour',
        'items.productPricing',
        'items.productPricing.uom',
      ],
    });

    if (!saleReturn) {
      throw new NotFoundException('Sale return not found');
    }

    if (recordActivityLog) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'SALE_RETURN_VIEWED',
        description: 'Sale return viewed',
        metadata: { id },
      });
    }

    return saleReturn;
  }

  async edit(
    tenantDb: DataSource,
    id: string,
    dto: UpdateSaleReturnDto,
    user: { userId: string },
  ) {
    const existing = await tenantDb.getRepository(SaleReturn).findOne({
      where: { id },
      relations: ['items'],
    });
    if (!existing) {
      throw new NotFoundException('Sale return not found');
    }
    if (!this.isEditable(existing)) {
      throw new BadRequestException(
        'Sale return can only be edited while it is pending and before approval',
      );
    }

    const nextReturnType = dto.returnType ?? existing.returnType;
    const nextRetailerId = dto.retailerId ?? existing.retailerId;
    const nextOrderId =
      dto.orderId !== undefined
        ? dto.orderId
        : existing.orderId;

    this.assertReturnTypeConsistency({
      returnType: nextReturnType,
      orderId: nextOrderId,
    });

    if (dto.retailerId) {
      await this.ensureRetailer(tenantDb, dto.retailerId);
    }
    if (dto.items) {
      await this.assertItems(tenantDb, dto.items);
    }

    await tenantDb.transaction(async (manager) => {
      const returnRepo = manager.getRepository(SaleReturn);
      const itemRepo = manager.getRepository(SaleReturnItem);

      const resolvedItems = await this.resolveReturnItems(manager, {
        returnType: nextReturnType,
        retailerId: nextRetailerId,
        orderId: nextOrderId,
        items: dto.items ?? existing.items.map((item) => ({
          productId: item.productId,
          productFlavourId: Number(item.productFlavourId),
          productPricingId: item.productPricingId,
          orderedQuantity: item.orderedQuantity,
          returnedQuantity: item.returnedQuantity,
          total: Number(item.total),
          returnReason: item.retirnReason,
        })),
        excludeReturnId: id,
      });

      existing.returnType = nextReturnType;
      existing.retailerId = nextRetailerId;
      existing.orderId =
        nextReturnType === ReturnType.ORDER ? nextOrderId ?? null : null;
      if (dto.returnDate !== undefined) {
        existing.returnDate = new Date(dto.returnDate);
      }
      if (dto.note !== undefined) {
        existing.note = dto.note?.trim() ?? null;
      }
      if (dto.returnAmount !== undefined) {
        existing.returnAmount = dto.returnAmount;
      }

      await returnRepo.save(existing);

      if (dto.items) {
        await itemRepo.delete({ saleReturnId: id });
        await itemRepo.save(
          resolvedItems.map((item) =>
            itemRepo.create({
              saleReturnId: id,
              productId: item.productId,
              productFlavourId: item.productFlavourId,
              productPricingId: item.productPricingId,
              orderedQuantity: item.orderedQuantity,
              returnedQuantity: item.returnedQuantity,
              total: item.total,
              retirnReason: item.returnReason,
            }),
          ),
        );
      } else if (
        dto.returnType !== undefined ||
        dto.retailerId !== undefined ||
        dto.orderId !== undefined
      ) {
        await itemRepo.delete({ saleReturnId: id });
        await itemRepo.save(
          resolvedItems.map((item) =>
            itemRepo.create({
              saleReturnId: id,
              productId: item.productId,
              productFlavourId: item.productFlavourId,
              productPricingId: item.productPricingId,
              orderedQuantity: item.orderedQuantity,
              returnedQuantity: item.returnedQuantity,
              total: item.total,
              retirnReason: item.returnReason,
            }),
          ),
        );
      }
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_RETURN_UPDATED',
      description: 'Sale return updated',
      metadata: { id },
    });

    return this.view(tenantDb, id, user, { recordActivityLog: false });
  }

  async updateStatus(
    tenantDb: DataSource,
    id: string,
    dto: UpdateSaleReturnStatusDto,
    user: { userId: string },
  ) {
    if (
      dto.returnStatus !== ReturnStatus.APPROVED &&
      dto.returnStatus !== ReturnStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Only APPROVED and REJECTED statuses are allowed',
      );
    }

    await this.ensureUser(tenantDb, user.userId);

    const outcome = await tenantDb.transaction(
      async (manager): Promise<'noop' | 'updated'> => {
        const returnRepo = manager.getRepository(SaleReturn);
        const saleReturn = await returnRepo.findOne({
          where: { id },
          relations: ['items'],
          lock: { mode: 'pessimistic_write' },
        });

        if (!saleReturn) {
          throw new NotFoundException('Sale return not found');
        }

        if (
          this.isExecuted(saleReturn) &&
          dto.returnStatus !== ReturnStatus.APPROVED
        ) {
          throw new BadRequestException(
            'Cannot change status once the return has been approved and posted',
          );
        }

        if (saleReturn.returnStatus === ReturnStatus.REJECTED) {
          throw new BadRequestException('Rejected sale returns cannot be updated');
        }

        const needsApprovalPost =
          dto.returnStatus === ReturnStatus.APPROVED &&
          !this.isExecuted(saleReturn);
        const isNoop =
          dto.returnStatus === saleReturn.returnStatus && !needsApprovalPost;

        if (isNoop) {
          return 'noop';
        }

        if (dto.returnStatus === ReturnStatus.APPROVED) {
          if (saleReturn.returnStatus !== ReturnStatus.PENDING) {
            throw new BadRequestException(
              'Only pending sale returns can be approved',
            );
          }

          const resolvedItems = saleReturn.items.map((item) => ({
            productId: item.productId,
            productFlavourId: item.productFlavourId,
            productPricingId: item.productPricingId,
            orderedQuantity: item.orderedQuantity,
            returnedQuantity: item.returnedQuantity,
            total: Number(item.total),
            returnReason: item.retirnReason,
          }));

          saleReturn.returnStatus = ReturnStatus.APPROVED;
          await this.recordReturnApproval(
            manager,
            saleReturn,
            resolvedItems,
            user.userId,
          );
        } else {
          if (saleReturn.returnStatus !== ReturnStatus.PENDING) {
            throw new BadRequestException(
              'Only pending sale returns can be rejected',
            );
          }
          saleReturn.returnStatus = ReturnStatus.REJECTED;
        }

        await returnRepo.save(saleReturn);
        return 'updated';
      },
    );

    if (outcome === 'updated') {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'SALE_RETURN_STATUS_UPDATED',
        description: 'Sale return status updated',
        metadata: { id, returnStatus: dto.returnStatus },
      });
    }

    return this.view(tenantDb, id, user, { recordActivityLog: false });
  }

  async list(
    tenantDb: DataSource,
    pageInput: number,
    limitInput: number,
    filters: {
      retailerIds?: string;
      shopName?: string;
      dateFrom?: string;
      dateTo?: string;
      returnStatus?: string;
      returnType?: string;
      search?: string;
    },
    user: { userId: string },
  ) {
    const page = this.normalizePage(pageInput);
    const limit = this.normalizeLimit(limitInput);
    const retailerIds = this.parseRetailerIds(filters.retailerIds);
    const dateFrom = this.parseOptionalDayBoundary(filters.dateFrom);
    const dateTo = this.parseOptionalDayBoundary(filters.dateTo);
    const statusFilter = this.parseOptionalReturnStatus(filters.returnStatus);
    const typeFilter = this.parseOptionalReturnType(filters.returnType);

    const qb = tenantDb
      .getRepository(SaleReturn)
      .createQueryBuilder('sr')
      .innerJoinAndSelect('sr.retailer', 'r')
      .leftJoinAndSelect('sr.order', 'o');

    if (statusFilter) {
      qb.andWhere('sr."returnStatus" = :returnStatus', {
        returnStatus: statusFilter,
      });
    }

    if (typeFilter) {
      qb.andWhere('sr."returnType" = :returnType', { returnType: typeFilter });
    }

    if (retailerIds?.length) {
      qb.andWhere('sr."retailerId" IN (:...retailerIds)', { retailerIds });
    }

    const shop = (filters.shopName ?? '').trim();
    if (shop) {
      qb.andWhere('r."shopName" ILIKE :shopName', { shopName: `%${shop}%` });
    }

    const search = (filters.search ?? '').trim();
    if (search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('sr."returnNumber" ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('r."shopName" ILIKE :search', { search: `%${search}%` })
            .orWhere('o."orderNumber" ILIKE :search', { search: `%${search}%` });
        }),
      );
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    if (dateFrom) {
      qb.andWhere('sr."returnDate" >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('sr."returnDate" <= :dateTo', { dateTo: end });
    }

    const total = await qb.clone().getCount();

    const rows = await qb
      .clone()
      .orderBy('sr.returnDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_RETURN_LISTED',
      description: 'Sale returns listed',
      metadata: { total, page, limit, filters },
    });

    return {
      result: rows,
      meta: { total, page, limit },
    };
  }
}
