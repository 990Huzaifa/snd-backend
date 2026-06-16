import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, In } from 'typeorm';
import {
  DeliveryStatus,
  LoadSheet,
  LoadSheetItem,
  LoadSheetOrder,
  LoadSheetOrderItem,
  LoadSheetStatus,
} from 'src/tenant-db/entities/loadsheet.entity';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import {
  OrderStatus,
  SaleOrder,
  SaleOrderItem,
} from 'src/tenant-db/entities/saleorder.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateLoadSheetDto } from '../dto/loadsheet/create-loadsheet.dto';
import { UpdateLoadSheetDto } from '../dto/loadsheet/update-loadsheet.dto';
import { UpdateLoadSheetStatusDto } from '../dto/loadsheet/update-loadsheet-status.dto';
import { ListLoadSheetDto } from '../dto/loadsheet/list-loadsheet.dto';

type LoadSheetWriteStatus = LoadSheetStatus.DRAFT | LoadSheetStatus.ASSIGNED;

@Injectable()
export class LoadsheetService {
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

  private parseOptionalDate(value?: string): Date | undefined {
    if (!value?.trim()) {
      return undefined;
    }
    const date = new Date(value.trim());
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return date;
  }

  private parseOptionalStatus(value?: string): LoadSheetStatus | undefined {
    const normalized = value?.trim();
    if (!normalized) {
      return undefined;
    }
    if (!(Object.values(LoadSheetStatus) as string[]).includes(normalized)) {
      throw new BadRequestException(
        `Invalid status filter (use one of: ${Object.values(LoadSheetStatus).join(', ')})`,
      );
    }
    return normalized as LoadSheetStatus;
  }

  private ensureWritableStatus(status: LoadSheetStatus): LoadSheetWriteStatus {
    if (status === LoadSheetStatus.DRAFT || status === LoadSheetStatus.ASSIGNED) {
      return status;
    }
    throw new BadRequestException(
      'Load sheet can only be edited while status is DRAFT or ASSIGNED',
    );
  }

  private async generateLoadSheetNumber(tenantDb: DataSource): Promise<string> {
    const repo = tenantDb.getRepository(LoadSheet);
    while (true) {
      const loadSheetNumber = `LS${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`;
      const exists = await repo.findOne({
        where: { loadSheetNumber },
        select: ['id'],
      });
      if (!exists) {
        return loadSheetNumber;
      }
    }
  }

  private async assertCoreReferences(
    tenantDb: DataSource,
    dto: Pick<CreateLoadSheetDto, 'distributorId' | 'riderId'>,
  ) {
    const distributor = await tenantDb.getRepository(Distributor).findOne({
      where: { id: dto.distributorId, isDeleted: false },
      select: ['id'],
    });
    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }

    const rider = await tenantDb.getRepository(User).findOne({
      where: { id: dto.riderId, isDeleted: false },
      select: ['id'],
    });
    if (!rider) {
      throw new NotFoundException('Rider not found');
    }
  }

  private async fetchEligibleSaleOrders(
    tenantDb: DataSource,
    distributorId: string,
    saleOrderIds: string[],
  ): Promise<SaleOrder[]> {
    const uniqueOrderIds = [...new Set(saleOrderIds)];
    if (!uniqueOrderIds.length) {
      throw new BadRequestException('At least one sale order is required');
    }

    const orders = await tenantDb.getRepository(SaleOrder).find({
      where: { id: In(uniqueOrderIds) },
      relations: ['items'],
    });

    if (orders.length !== uniqueOrderIds.length) {
      throw new NotFoundException('One or more sale orders not found');
    }

    const disallowedStatuses = new Set<OrderStatus>([
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
      OrderStatus.DELIVERED,
    ]);

    for (const order of orders) {
      if (order.distributorId !== distributorId) {
        throw new BadRequestException(
          `Sale order ${order.orderNumber} does not belong to selected distributor`,
        );
      }
      if (disallowedStatuses.has(order.orderStatus)) {
        throw new BadRequestException(
          `Sale order ${order.orderNumber} cannot be used in a load sheet`,
        );
      }
      if (!order.items?.length) {
        throw new BadRequestException(
          `Sale order ${order.orderNumber} has no items`,
        );
      }
    }

    const linked = await tenantDb
      .getRepository(LoadSheetOrder)
      .createQueryBuilder('lso')
      .innerJoinAndSelect('lso.loadSheet', 'ls')
      .where('lso.saleOrderId IN (:...saleOrderIds)', { saleOrderIds: uniqueOrderIds })
      .andWhere('ls.status != :cancelledStatus', {
        cancelledStatus: LoadSheetStatus.CANCELLED,
      })
      .getMany();

    if (linked.length) {
      const blockedOrderIds = new Set(linked.map((row) => row.saleOrderId));
      const blocked = orders
        .filter((order) => blockedOrderIds.has(order.id))
        .map((order) => order.orderNumber);
      throw new BadRequestException(
        `Sale orders already linked to an active load sheet: ${blocked.join(', ')}`,
      );
    }

    return orders;
  }

  async list(
    tenantDb: DataSource,
    filters: ListLoadSheetDto,
    user: { userId: string },
  ) {
    const page = this.normalizePage(filters.page);
    const limit = this.normalizeLimit(filters.limit);
    const status = this.parseOptionalStatus(filters.status);
    const dateFrom = this.parseOptionalDate(filters.dateFrom);
    const dateTo = this.parseOptionalDate(filters.dateTo);

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    const qb = tenantDb
      .getRepository(LoadSheet)
      .createQueryBuilder('ls')
      .leftJoinAndSelect('ls.distributor', 'distributor')
      .leftJoinAndSelect('ls.rider', 'rider');

    const normalizedSearch = (filters.search ?? '').trim();
    if (normalizedSearch) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('ls."loadSheetNumber" ILIKE :search', {
              search: `%${normalizedSearch}%`,
            })
            .orWhere('distributor.name ILIKE :search', {
              search: `%${normalizedSearch}%`,
            })
            .orWhere('rider.name ILIKE :search', {
              search: `%${normalizedSearch}%`,
            })
            .orWhere('ls."vehicleNumber" ILIKE :search', {
              search: `%${normalizedSearch}%`,
            });
        }),
      );
    }

    if (status) {
      qb.andWhere('ls.status = :status', { status });
    }
    if (filters.riderId) {
      qb.andWhere('ls."riderId" = :riderId', { riderId: filters.riderId });
    }
    if (filters.distributorId) {
      qb.andWhere('ls."distributorId" = :distributorId', {
        distributorId: filters.distributorId,
      });
    }
    if (dateFrom) {
      qb.andWhere('ls."loadSheetDate" >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      qb.andWhere('ls."loadSheetDate" <= :dateTo', { dateTo: endOfDay });
    }

    const total = await qb.clone().getCount();
    const sheets = await qb
      .clone()
      .select([
        'ls.id',
        'ls.loadSheetNumber',
        'ls.loadSheetDate',
        'ls.status',
        'ls.vehicleNumber',
        'ls.dispatchDate',
        'ls.completedDate',
        'ls.createdAt',
        'distributor.id',
        'distributor.name',
        'rider.id',
        'rider.name',
      ])
      .orderBy('ls.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const loadSheetIds = sheets.map((sheet) => sheet.id);
    const orderCountByLoadSheetId = new Map<string, number>();
    const productStatsByLoadSheetId = new Map<
      string,
      { productCount: number; totalQty: number }
    >();

    if (loadSheetIds.length) {
      const orderCounts = await tenantDb
        .getRepository(LoadSheetOrder)
        .createQueryBuilder('lso')
        .select('lso.loadSheetId', 'loadSheetId')
        .addSelect('COUNT(lso.id)', 'orderCount')
        .where('lso.loadSheetId IN (:...loadSheetIds)', { loadSheetIds })
        .groupBy('lso.loadSheetId')
        .getRawMany<{ loadSheetId: string; orderCount: string }>();

      for (const row of orderCounts) {
        orderCountByLoadSheetId.set(row.loadSheetId, Number(row.orderCount));
      }

      const productStats = await tenantDb
        .getRepository(LoadSheetItem)
        .createQueryBuilder('lsi')
        .select('lsi.loadSheetId', 'loadSheetId')
        .addSelect('COUNT(lsi.id)', 'productCount')
        .addSelect('COALESCE(SUM(lsi.quantity), 0)', 'totalQty')
        .where('lsi.loadSheetId IN (:...loadSheetIds)', { loadSheetIds })
        .groupBy('lsi.loadSheetId')
        .getRawMany<{
          loadSheetId: string;
          productCount: string;
          totalQty: string;
        }>();

      for (const row of productStats) {
        productStatsByLoadSheetId.set(row.loadSheetId, {
          productCount: Number(row.productCount),
          totalQty: Number(row.totalQty),
        });
      }
    }

    const result = sheets.map((sheet) => {
      const productStats = productStatsByLoadSheetId.get(sheet.id);
      return {
        ...sheet,
        orderCount: orderCountByLoadSheetId.get(sheet.id) ?? 0,
        productCount: productStats?.productCount ?? 0,
        totalQty: productStats?.totalQty ?? 0,
      };
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'LOADSHEET_LISTED',
      description: 'Load sheets listed',
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

    const sheet = await tenantDb.getRepository(LoadSheet).findOne({
      where: { id },
      relations: [
        'distributor',
        'rider',
        'createdByUser',
        'loadSheetItems',
        'loadSheetItems.product',
        'loadSheetItems.productFlavour',
        'loadSheetItems.productFlavour.flavour',
        'loadSheetItems.productPricing',
        'loadSheetItems.productPricing.uom',
        'loadSheetOrders',
        'loadSheetOrders.saleOrder',
        'loadSheetOrders.retailer',
        'loadSheetOrders.salesman',
        'loadSheetOrders.loadSheetOrderItems',
        'loadSheetOrders.loadSheetOrderItems.saleOrderItem',
        'loadSheetOrders.loadSheetOrderItems.product',
        'loadSheetOrders.loadSheetOrderItems.productFlavour',
        'loadSheetOrders.loadSheetOrderItems.productFlavour.flavour',
        'loadSheetOrders.loadSheetOrderItems.productPricing',
        'loadSheetOrders.loadSheetOrderItems.productPricing.uom',
      ],
      order: {
        loadSheetItems: { createdAt: 'ASC' },
        loadSheetOrders: {
          deliverySequence: 'ASC',
          createdAt: 'ASC',
          loadSheetOrderItems: { createdAt: 'ASC' },
        },
      },
    });

    if (!sheet) {
      throw new NotFoundException('Load sheet not found');
    }

    if (recordActivityLog) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'LOADSHEET_VIEWED',
        description: `Load sheet ${sheet.loadSheetNumber} viewed`,
        metadata: { loadSheetId: sheet.id },
      });
    }

    return sheet;
  }

  async create(
    tenantDb: DataSource,
    dto: CreateLoadSheetDto,
    user: { userId: string },
  ) {
    await this.assertCoreReferences(tenantDb, dto);

    const initialStatus = dto.status ?? LoadSheetStatus.DRAFT;
    if (
      initialStatus !== LoadSheetStatus.DRAFT &&
      initialStatus !== LoadSheetStatus.ASSIGNED
    ) {
      throw new BadRequestException(
        'Initial load sheet status can only be DRAFT or ASSIGNED',
      );
    }

    const saleOrders = await this.fetchEligibleSaleOrders(
      tenantDb,
      dto.distributorId,
      dto.orders.map((order) => order.saleOrderId),
    );
    const saleOrderById = new Map(saleOrders.map((order) => [order.id, order]));

    const created = await tenantDb.transaction(async (manager) => {
      const loadSheetRepo = manager.getRepository(LoadSheet);
      const loadSheetOrderRepo = manager.getRepository(LoadSheetOrder);
      const loadSheetOrderItemRepo = manager.getRepository(LoadSheetOrderItem);
      const loadSheetItemRepo = manager.getRepository(LoadSheetItem);

      const entity = loadSheetRepo.create({
        loadSheetNumber: await this.generateLoadSheetNumber(tenantDb),
        loadSheetDate: new Date(dto.loadSheetDate),
        distributorId: dto.distributorId,
        riderId: dto.riderId,
        vehicleNumber: dto.vehicleNumber?.trim() || null,
        status: initialStatus,
        createdBy: user.userId,
      });
      const savedLoadSheet = await loadSheetRepo.save(entity);

      const orderRows = dto.orders.map((selectedOrder, index) => {
        const order = saleOrderById.get(selectedOrder.saleOrderId);
        if (!order) {
          throw new NotFoundException('Sale order not found');
        }
        return loadSheetOrderRepo.create({
          loadSheetId: savedLoadSheet.id,
          saleOrderId: order.id,
          retailerId: order.retailerId,
          salesmanId: order.salesmanId,
          deliveryStatus: DeliveryStatus.PENDING,
          deliverySequence: selectedOrder.deliverySequence ?? index + 1,
        });
      });

      const savedOrderRows = await loadSheetOrderRepo.save(orderRows);
      const loadSheetOrderIdBySaleOrderId = new Map(
        savedOrderRows.map((row) => [row.saleOrderId, row.id]),
      );

      const orderItemRows: LoadSheetOrderItem[] = [];
      const aggregateQuantity = new Map<string, number>();

      for (const saleOrder of saleOrders) {
        const loadSheetOrderId = loadSheetOrderIdBySaleOrderId.get(saleOrder.id);
        if (!loadSheetOrderId) {
          throw new NotFoundException('Load sheet order not found');
        }

        for (const item of saleOrder.items) {
          orderItemRows.push(
            loadSheetOrderItemRepo.create({
              loadSheetOrderId,
              saleOrderItemId: item.id,
              productId: item.productId,
              productFlavourId: item.productFlavourId,
              productPricingId: item.productPricingId,
              orderedQuantity: item.quantity,
              deliveredQuantity: 0,
              returnedQuantity: 0,
              shortQuantity: 0,
              status: DeliveryStatus.PENDING,
            }),
          );

          const key = `${item.productId}:${item.productFlavourId}:${item.productPricingId}`;
          aggregateQuantity.set(
            key,
            (aggregateQuantity.get(key) ?? 0) + Number(item.quantity),
          );
        }
      }

      if (orderItemRows.length) {
        await loadSheetOrderItemRepo.save(orderItemRows);
      }

      const loadSheetItems = [...aggregateQuantity.entries()].map(
        ([key, quantity]) => {
          const [productId, productFlavourId, productPricingId] = key.split(':');
          return loadSheetItemRepo.create({
            loadSheetId: savedLoadSheet.id,
            productId,
            productFlavourId,
            productPricingId,
            quantity,
          });
        },
      );
      if (loadSheetItems.length) {
        await loadSheetItemRepo.save(loadSheetItems);
      }

      return { id: savedLoadSheet.id, loadSheetNumber: savedLoadSheet.loadSheetNumber };
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'LOADSHEET_CREATED',
      description: 'Load sheet created',
      metadata: {
        loadSheetId: created.id,
        loadSheetNumber: created.loadSheetNumber,
        saleOrderCount: dto.orders.length,
      },
    });

    return this.view(tenantDb, created.id, user, { recordActivityLog: false });
  }

  async edit(
    tenantDb: DataSource,
    id: string,
    dto: UpdateLoadSheetDto,
    user: { userId: string },
  ) {
    const repo = tenantDb.getRepository(LoadSheet);
    const existing = await repo.findOne({
      where: { id },
      select: ['id', 'loadSheetNumber', 'status', 'riderId', 'loadSheetDate', 'vehicleNumber'],
    });
    if (!existing) {
      throw new NotFoundException('Load sheet not found');
    }

    this.ensureWritableStatus(existing.status);

    if (dto.status !== undefined && dto.status !== existing.status) {
      throw new BadRequestException(
        'Load sheet status can only be changed via updateStatus',
      );
    }

    if (dto.riderId && dto.riderId !== existing.riderId) {
      const rider = await tenantDb.getRepository(User).findOne({
        where: { id: dto.riderId, isDeleted: false },
        select: ['id'],
      });
      if (!rider) {
        throw new NotFoundException('Rider not found');
      }
    }

    await repo.update(id, {
      riderId: dto.riderId,
      loadSheetDate: dto.loadSheetDate ? new Date(dto.loadSheetDate) : undefined,
      vehicleNumber: dto.vehicleNumber?.trim() ?? undefined,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'LOADSHEET_UPDATED',
      description: `Load sheet ${existing.loadSheetNumber} updated`,
      metadata: { loadSheetId: existing.id },
    });

    return this.view(tenantDb, id, user, { recordActivityLog: false });
  }

  async updateStatus(
    tenantDb: DataSource,
    id: string,
    dto: UpdateLoadSheetStatusDto,
    user: { userId: string },
  ) {
    const transitionMap: Record<LoadSheetStatus, LoadSheetStatus[]> = {
      [LoadSheetStatus.DRAFT]: [LoadSheetStatus.ASSIGNED, LoadSheetStatus.CANCELLED],
      [LoadSheetStatus.ASSIGNED]: [LoadSheetStatus.DISPATCHED, LoadSheetStatus.CANCELLED],
      [LoadSheetStatus.DISPATCHED]: [LoadSheetStatus.INPROGRESS, LoadSheetStatus.CANCELLED],
      [LoadSheetStatus.INPROGRESS]: [LoadSheetStatus.COMPLETED, LoadSheetStatus.CANCELLED],
      [LoadSheetStatus.COMPLETED]: [],
      [LoadSheetStatus.CANCELLED]: [],
    };

    const outcome = await tenantDb.transaction(async (manager) => {
      const repo = manager.getRepository(LoadSheet);
      const sheet = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sheet) {
        throw new NotFoundException('Load sheet not found');
      }

      if (sheet.status === dto.status) {
        return 'noop';
      }

      const allowedNextStatuses = transitionMap[sheet.status] ?? [];
      if (!allowedNextStatuses.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid status transition from ${sheet.status} to ${dto.status}`,
        );
      }

      sheet.status = dto.status;
      if (dto.status === LoadSheetStatus.DISPATCHED && !sheet.dispatchDate) {
        sheet.dispatchDate = new Date();
      }
      if (dto.status === LoadSheetStatus.COMPLETED && !sheet.completedDate) {
        sheet.completedDate = new Date();
      }
      if (dto.status === LoadSheetStatus.CANCELLED) {
        sheet.completedDate = null;
      }

      await repo.save(sheet);
      return 'updated';
    });

    if (outcome === 'updated') {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'LOADSHEET_STATUS_UPDATED',
        description: `Load sheet status updated to ${dto.status}`,
        metadata: { loadSheetId: id, status: dto.status },
      });
    }

    return this.view(tenantDb, id, user, { recordActivityLog: false });
  }

  async printData(tenantDb: DataSource, id: string, user: { userId: string }) {
    const sheet = await tenantDb.getRepository(LoadSheet).findOne({
      where: { id },
      relations: [
        'distributor',
        'rider',
        'createdByUser',
        'loadSheetItems',
        'loadSheetItems.product',
        'loadSheetItems.productFlavour',
        'loadSheetItems.productFlavour.flavour',
        'loadSheetItems.productPricing',
        'loadSheetItems.productPricing.uom',
      ],
      order: {
        loadSheetItems: { createdAt: 'ASC' },
      },
    });

    if (!sheet) {
      throw new NotFoundException('Load sheet not found');
    }


    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'LOADSHEET_PRINT_DATA_VIEWED',
      description: `Load sheet ${sheet.loadSheetNumber} print data viewed`,
      metadata: { loadSheetId: sheet.id },
    });

    return {
      loadSheet: sheet,
    };
  }
}
