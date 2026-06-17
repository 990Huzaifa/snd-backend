import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { S3Service } from 'src/common/s3/s3.service';
import {
  DeliveryStatus,
  LoadSheet,
  LoadSheetOrder,
  LoadSheetOrderItem,
  LoadSheetStatus,
} from 'src/tenant-db/entities/loadsheet.entity';
import {
  OrderStatus,
  SaleOrder,
} from 'src/tenant-db/entities/saleorder.entity';
import { ActivityLogService } from '../activity-log.service';
import { LoadsheetService } from '../loadsheet.service';
import { ListRiderLoadsheetDto } from '../../dto/rider-app/loadsheet/list-rider-loadsheet.dto';
import { UpdateOrderDeliveryDto } from '../../dto/rider-app/loadsheet/update-order-delivery.dto';
import { BulkUpdateLoadsheetDeliveryDto } from '../../dto/rider-app/loadsheet/bulk-update-loadsheet-delivery.dto';
import {
  RIDER_DELIVERY_IMAGE_ALLOWED_MIME_TYPES,
  RIDER_DELIVERY_IMAGE_MAX_BYTES,
} from '../../config/rider-delivery-image.multer';

const RIDER_VISIBLE_STATUSES: LoadSheetStatus[] = [
  LoadSheetStatus.ASSIGNED,
  LoadSheetStatus.DISPATCHED,
  LoadSheetStatus.INPROGRESS,
  LoadSheetStatus.COMPLETED,
];

const TERMINAL_DELIVERY_STATUSES = new Set<DeliveryStatus>([
  DeliveryStatus.DELIVERED,
  DeliveryStatus.PARTIAL,
  DeliveryStatus.NOT_DELIVERED,
  DeliveryStatus.CANCELLED,
]);

const DELIVERABLE_LOADSHEET_STATUSES = new Set<LoadSheetStatus>([
  LoadSheetStatus.INPROGRESS,
]);

type DeliveryImageFiles = {
  customerSignature?: Express.Multer.File;
  deliveryProof?: Express.Multer.File;
};

@Injectable()
export class RiderLoadsheetService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly loadsheetService: LoadsheetService,
    private readonly s3Service: S3Service,
  ) {}

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

  private parseDeliveredDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid deliveredDate: ${value}`);
    }
    return date;
  }

  private assertDeliveryImageFile(
    file: Express.Multer.File,
    fieldName: string,
  ): void {
    if (
      !RIDER_DELIVERY_IMAGE_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof RIDER_DELIVERY_IMAGE_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        `${fieldName} must be a PNG or JPEG image (png, jpg, jpeg)`,
      );
    }
    if (!file.buffer?.length) {
      throw new BadRequestException(`${fieldName} file is empty`);
    }
    if (file.size > RIDER_DELIVERY_IMAGE_MAX_BYTES) {
      throw new BadRequestException(
        `${fieldName} must not exceed ${RIDER_DELIVERY_IMAGE_MAX_BYTES} bytes`,
      );
    }
  }

  private imageExtension(mimetype: string): string {
    if (mimetype === 'image/png') {
      return 'png';
    }
    if (mimetype === 'image/jpeg') {
      return 'jpg';
    }
    throw new BadRequestException('Image must be PNG or JPEG');
  }

  private imageUrlToS3Key(url: string | null | undefined): string | null {
    const trimmed = url?.trim();
    if (!trimmed) {
      return null;
    }
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      return null;
    }
    const region = process.env.AWS_REGION || 'ap-south-1';
    const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`;
    if (!trimmed.startsWith(prefix)) {
      return null;
    }
    return trimmed.slice(prefix.length);
  }

  private async uploadDeliveryImage(
    tenantCode: string,
    loadSheetOrderId: string,
    fieldName: 'customer-signature' | 'delivery-proof',
    file: Express.Multer.File,
  ): Promise<string> {
    this.assertDeliveryImageFile(file, fieldName);
    const extension = this.imageExtension(file.mimetype);
    const key = `tenants/${tenantCode}/loadsheets/delivery-images/${loadSheetOrderId}/${fieldName}.${extension}`;
    const { url } = await this.s3Service.uploadObject(
      key,
      file.buffer,
      file.mimetype,
    );
    return url;
  }

  private async replaceDeliveryImage(
    tenantCode: string,
    loadSheetOrderId: string,
    fieldName: 'customer-signature' | 'delivery-proof',
    file: Express.Multer.File,
    existingUrl?: string | null,
  ): Promise<string> {
    const url = await this.uploadDeliveryImage(
      tenantCode,
      loadSheetOrderId,
      fieldName,
      file,
    );
    const oldKey = this.imageUrlToS3Key(existingUrl);
    const newKey = this.imageUrlToS3Key(url);
    if (oldKey && oldKey !== newKey) {
      await this.s3Service.deleteObject(oldKey).catch(() => undefined);
    }
    return url;
  }

  private async resolveOwnedLoadsheet(
    tenantDb: DataSource,
    loadSheetId: string,
    riderId: string,
    manager?: EntityManager,
  ): Promise<LoadSheet> {
    const repo = (manager ?? tenantDb).getRepository(LoadSheet);
    const sheet = await repo.findOne({ where: { id: loadSheetId } });
    if (!sheet) {
      throw new NotFoundException('Load sheet not found');
    }
    if (sheet.riderId !== riderId) {
      throw new ForbiddenException('You are not assigned to this load sheet');
    }
    return sheet;
  }

  private async resolveOwnedLoadsheetOrder(
    tenantDb: DataSource,
    manager: EntityManager,
    loadSheetId: string,
    loadSheetOrderId: string,
    riderId: string,
  ): Promise<LoadSheetOrder> {
    await this.resolveOwnedLoadsheet(
      tenantDb,
      loadSheetId,
      riderId,
      manager,
    );

    const order = await manager.getRepository(LoadSheetOrder).findOne({
      where: { id: loadSheetOrderId, loadSheetId },
      relations: ['loadSheetOrderItems', 'saleOrder'],
    });
    if (!order) {
      throw new NotFoundException('Load sheet order not found');
    }
    return order;
  }

  private deriveItemStatus(
    orderedQuantity: number,
    deliveredQuantity: number,
    shortQuantity: number,
    returnedQuantity: number,
  ): DeliveryStatus {
    if (deliveredQuantity >= orderedQuantity) {
      return DeliveryStatus.DELIVERED;
    }
    if (deliveredQuantity === 0 && shortQuantity + returnedQuantity >= orderedQuantity) {
      return DeliveryStatus.NOT_DELIVERED;
    }
    if (deliveredQuantity > 0) {
      return DeliveryStatus.PARTIAL;
    }
    return DeliveryStatus.PENDING;
  }

  private mapSaleOrderStatus(deliveryStatus: DeliveryStatus): OrderStatus {
    if (deliveryStatus === DeliveryStatus.DELIVERED) {
      return OrderStatus.DELIVERED;
    }
    if (
      deliveryStatus === DeliveryStatus.PARTIAL ||
      deliveryStatus === DeliveryStatus.NOT_DELIVERED
    ) {
      return OrderStatus.PROCESSING;
    }
    if (deliveryStatus === DeliveryStatus.CANCELLED) {
      return OrderStatus.CANCELLED;
    }
    return OrderStatus.PROCESSING;
  }

  private assertDeliveryPayload(dto: UpdateOrderDeliveryDto): void {
    if (!TERMINAL_DELIVERY_STATUSES.has(dto.deliveryStatus)) {
      throw new BadRequestException(
        `deliveryStatus must be one of: ${[...TERMINAL_DELIVERY_STATUSES].join(', ')}`,
      );
    }
  }

  private applyOrderDeliveryUpdate(
    loadSheetOrder: LoadSheetOrder,
    dto: UpdateOrderDeliveryDto,
    imageUrls?: { customerSignature?: string; deliveryProof?: string },
  ): void {
    this.assertDeliveryPayload(dto);

    const itemById = new Map(
      (loadSheetOrder.loadSheetOrderItems ?? []).map((item) => [item.id, item]),
    );
    const seenItemIds = new Set<string>();

    for (const row of dto.items) {
      if (seenItemIds.has(row.loadSheetOrderItemId)) {
        throw new BadRequestException(
          `Duplicate loadSheetOrderItemId: ${row.loadSheetOrderItemId}`,
        );
      }
      seenItemIds.add(row.loadSheetOrderItemId);

      const item = itemById.get(row.loadSheetOrderItemId);
      if (!item) {
        throw new NotFoundException(
          `Load sheet order item ${row.loadSheetOrderItemId} not found`,
        );
      }

      const orderedQuantity = Number(item.orderedQuantity);
      const deliveredQuantity = Number(row.deliveredQuantity);
      const shortQuantity = Number(row.shortQuantity);
      const returnedQuantity = Number(row.returnedQuantity);

      if (
        deliveredQuantity < 0 ||
        shortQuantity < 0 ||
        returnedQuantity < 0
      ) {
        throw new BadRequestException('Quantities cannot be negative');
      }

      const accounted =
        deliveredQuantity + shortQuantity + returnedQuantity;
      if (accounted > orderedQuantity) {
        throw new BadRequestException(
          `Item ${item.id}: delivered + short + returned cannot exceed ordered quantity`,
        );
      }

      item.deliveredQuantity = deliveredQuantity;
      item.shortQuantity = shortQuantity;
      item.returnedQuantity = returnedQuantity;
      item.status = this.deriveItemStatus(
        orderedQuantity,
        deliveredQuantity,
        shortQuantity,
        returnedQuantity,
      );
    }

    if (seenItemIds.size !== itemById.size) {
      throw new BadRequestException(
        'All load sheet order items must be included in the delivery update',
      );
    }

    loadSheetOrder.deliveryStatus = dto.deliveryStatus;
    loadSheetOrder.remarks = dto.remarks?.trim() || null;

    if (imageUrls?.customerSignature) {
      loadSheetOrder.customerSignature = imageUrls.customerSignature;
    }
    if (imageUrls?.deliveryProof) {
      loadSheetOrder.deliveryProof = imageUrls.deliveryProof;
    }

    if (loadSheetOrder.saleOrder) {
      loadSheetOrder.saleOrder.orderStatus = this.mapSaleOrderStatus(
        dto.deliveryStatus,
      );
      loadSheetOrder.saleOrder.deliveredDate = this.parseDeliveredDate(
        dto.deliveredDate,
      );
    }
  }

  private async maybeCompleteLoadsheet(
    manager: EntityManager,
    loadSheetId: string,
  ): Promise<void> {
    const orderRepo = manager.getRepository(LoadSheetOrder);
    const sheetRepo = manager.getRepository(LoadSheet);
    const orders = await orderRepo.find({ where: { loadSheetId } });
    const allTerminal = orders.every((order) =>
      TERMINAL_DELIVERY_STATUSES.has(order.deliveryStatus),
    );
    if (!allTerminal) {
      return;
    }

    const sheet = await sheetRepo.findOne({
      where: { id: loadSheetId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!sheet || sheet.status === LoadSheetStatus.COMPLETED) {
      return;
    }

    sheet.status = LoadSheetStatus.COMPLETED;
    if (!sheet.completedDate) {
      sheet.completedDate = new Date();
    }
    await sheetRepo.save(sheet);
  }

  async fetchRiderLoadsheets(
    tenantDb: DataSource,
    filters: ListRiderLoadsheetDto,
    user: { userId: string },
  ) {
    const page = this.normalizePage(filters.page);
    const limit = this.normalizeLimit(filters.limit);

    const qb = tenantDb
      .getRepository(LoadSheet)
      .createQueryBuilder('ls')
      .leftJoinAndSelect('ls.distributor', 'distributor')
      .where('ls."riderId" = :riderId', { riderId: user.userId })
      .andWhere('ls.status IN (:...statuses)', {
        statuses: filters.status
          ? [filters.status]
          : RIDER_VISIBLE_STATUSES,
      });

    if (filters.distributorId) {
      qb.andWhere('ls."distributorId" = :distributorId', {
        distributorId: filters.distributorId,
      });
    }

    const total = await qb.clone().getCount();
    const sheets = await qb
      .orderBy('ls.loadSheetDate', 'DESC')
      .addOrderBy('ls.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const loadSheetIds = sheets.map((sheet) => sheet.id);
    const orderCountByLoadSheetId = new Map<string, number>();
    const pendingCountByLoadSheetId = new Map<string, number>();

    if (loadSheetIds.length) {
      const counts = await tenantDb
        .getRepository(LoadSheetOrder)
        .createQueryBuilder('lso')
        .select('lso.loadSheetId', 'loadSheetId')
        .addSelect('COUNT(lso.id)', 'orderCount')
        .addSelect(
          `SUM(CASE WHEN lso."deliveryStatus" = :pendingStatus THEN 1 ELSE 0 END)`,
          'pendingCount',
        )
        .where('lso.loadSheetId IN (:...loadSheetIds)', { loadSheetIds })
        .setParameter('pendingStatus', DeliveryStatus.PENDING)
        .groupBy('lso.loadSheetId')
        .getRawMany<{
          loadSheetId: string;
          orderCount: string;
          pendingCount: string;
        }>();

      for (const row of counts) {
        orderCountByLoadSheetId.set(row.loadSheetId, Number(row.orderCount));
        pendingCountByLoadSheetId.set(row.loadSheetId, Number(row.pendingCount));
      }
    }

    const result = sheets.map((sheet) => ({
      ...sheet,
      orderCount: orderCountByLoadSheetId.get(sheet.id) ?? 0,
      pendingOrderCount: pendingCountByLoadSheetId.get(sheet.id) ?? 0,
    }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RIDER_LOADSHEET_LISTED',
      description: 'Rider load sheets listed',
      metadata: { total, page, limit, distributorId: filters.distributorId },
    });

    return { result, meta: { total, page, limit } };
  }

  async viewRiderLoadsheet(
    tenantDb: DataSource,
    loadSheetId: string,
    user: { userId: string },
  ) {
    await this.resolveOwnedLoadsheet(tenantDb, loadSheetId, user.userId);
    return this.loadsheetService.view(tenantDb, loadSheetId, user, {
      recordActivityLog: false,
    });
  }

  async startLoadsheet(
    tenantDb: DataSource,
    loadSheetId: string,
    user: { userId: string },
  ) {
    const outcome = await tenantDb.transaction(async (manager) => {
      const sheet = await this.resolveOwnedLoadsheet(
        tenantDb,
        loadSheetId,
        user.userId,
        manager,
      );

      if (sheet.status === LoadSheetStatus.INPROGRESS) {
        return 'noop' as const;
      }

      if (sheet.status !== LoadSheetStatus.DISPATCHED) {
        throw new BadRequestException(
          'Load sheet can only be started when status is DISPATCHED',
        );
      }

      sheet.status = LoadSheetStatus.INPROGRESS;
      if (!sheet.dispatchDate) {
        sheet.dispatchDate = new Date();
      }
      await manager.getRepository(LoadSheet).save(sheet);
      return 'updated' as const;
    });

    if (outcome === 'updated') {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'RIDER_LOADSHEET_STARTED',
        description: 'Rider started load sheet',
        metadata: { loadSheetId },
      });
    }

    return this.viewRiderLoadsheet(tenantDb, loadSheetId, user);
  }

  async updateOrderDelivery(
    tenantDb: DataSource,
    tenantCode: string,
    loadSheetId: string,
    loadSheetOrderId: string,
    dto: UpdateOrderDeliveryDto,
    user: { userId: string },
    images?: DeliveryImageFiles,
  ) {
    await tenantDb.transaction(async (manager) => {
      const sheet = await this.resolveOwnedLoadsheet(
        tenantDb,
        loadSheetId,
        user.userId,
        manager,
      );

      if (!DELIVERABLE_LOADSHEET_STATUSES.has(sheet.status)) {
        throw new BadRequestException(
          'Deliveries can only be updated while load sheet is INPROGRESS',
        );
      }

      const loadSheetOrder = await this.resolveOwnedLoadsheetOrder(
        tenantDb,
        manager,
        loadSheetId,
        loadSheetOrderId,
        user.userId,
      );

      const imageUrls: { customerSignature?: string; deliveryProof?: string } =
        {};
      if (images?.customerSignature) {
        imageUrls.customerSignature = await this.replaceDeliveryImage(
          tenantCode,
          loadSheetOrderId,
          'customer-signature',
          images.customerSignature,
          loadSheetOrder.customerSignature,
        );
      }
      if (images?.deliveryProof) {
        imageUrls.deliveryProof = await this.replaceDeliveryImage(
          tenantCode,
          loadSheetOrderId,
          'delivery-proof',
          images.deliveryProof,
          loadSheetOrder.deliveryProof,
        );
      }

      this.applyOrderDeliveryUpdate(loadSheetOrder, dto, imageUrls);

      await manager.getRepository(LoadSheetOrderItem).save(
        loadSheetOrder.loadSheetOrderItems ?? [],
      );
      await manager.getRepository(LoadSheetOrder).save(loadSheetOrder);
      if (loadSheetOrder.saleOrder) {
        await manager.getRepository(SaleOrder).save(loadSheetOrder.saleOrder);
      }

      await this.maybeCompleteLoadsheet(manager, loadSheetId);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RIDER_ORDER_DELIVERY_UPDATED',
      description: 'Rider updated order delivery',
      metadata: { loadSheetId, loadSheetOrderId, deliveryStatus: dto.deliveryStatus },
    });

    return this.viewRiderLoadsheet(tenantDb, loadSheetId, user);
  }

  async bulkUpdateLoadsheetDeliveries(
    tenantDb: DataSource,
    loadSheetId: string,
    dto: BulkUpdateLoadsheetDeliveryDto,
    user: { userId: string },
  ) {
    const orderIds = dto.orders.map((order) => order.loadSheetOrderId);
    if (new Set(orderIds).size !== orderIds.length) {
      throw new BadRequestException('Duplicate loadSheetOrderId in bulk payload');
    }

    await tenantDb.transaction(async (manager) => {
      const sheet = await this.resolveOwnedLoadsheet(
        tenantDb,
        loadSheetId,
        user.userId,
        manager,
      );

      if (!DELIVERABLE_LOADSHEET_STATUSES.has(sheet.status)) {
        throw new BadRequestException(
          'Deliveries can only be updated while load sheet is INPROGRESS',
        );
      }

      const existingOrders = await manager.getRepository(LoadSheetOrder).find({
        where: { loadSheetId, id: In(orderIds) },
        relations: ['loadSheetOrderItems', 'saleOrder'],
      });

      if (existingOrders.length !== orderIds.length) {
        throw new NotFoundException('One or more load sheet orders not found');
      }

      const orderById = new Map(existingOrders.map((order) => [order.id, order]));

      for (const orderDto of dto.orders) {
        const loadSheetOrder = orderById.get(orderDto.loadSheetOrderId);
        if (!loadSheetOrder) {
          throw new NotFoundException(
            `Load sheet order ${orderDto.loadSheetOrderId} not found`,
          );
        }

        const { loadSheetOrderId: _id, ...deliveryDto } = orderDto;
        this.applyOrderDeliveryUpdate(loadSheetOrder, deliveryDto);

        await manager.getRepository(LoadSheetOrderItem).save(
          loadSheetOrder.loadSheetOrderItems ?? [],
        );
        await manager.getRepository(LoadSheetOrder).save(loadSheetOrder);
        if (loadSheetOrder.saleOrder) {
          await manager.getRepository(SaleOrder).save(loadSheetOrder.saleOrder);
        }
      }

      await this.maybeCompleteLoadsheet(manager, loadSheetId);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RIDER_LOADSHEET_BULK_DELIVERY_UPDATED',
      description: 'Rider bulk updated load sheet deliveries',
      metadata: {
        loadSheetId,
        orderCount: dto.orders.length,
      },
    });

    return this.viewRiderLoadsheet(tenantDb, loadSheetId, user);
  }
}
