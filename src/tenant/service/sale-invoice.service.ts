import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager } from 'typeorm';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { ProductFlavour, ProductPricing } from 'src/tenant-db/entities/product.entity';
import { Retailer } from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { Scheme, SchemeSlab } from 'src/tenant-db/entities/scheme.entity';
import {
  InvoiceStatus,
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
import { OrderStatus, SaleOrder } from 'src/tenant-db/entities/saleorder.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateSaleInvoiceDto } from '../dto/sale-invoice/create-sale-invoice.dto';
import { UpdateSaleInvoiceStatusDto } from '../dto/sale-invoice/update-sale-invoice-status.dto';

@Injectable()
export class SaleInvoiceService {
  constructor(private readonly activityLogService: ActivityLogService) {}

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

  private parseOptionalInvoiceStatus(raw?: string): InvoiceStatus | undefined {
    const s = raw?.trim();
    if (!s) {
      return undefined;
    }
    const allowed = Object.values(InvoiceStatus) as string[];
    if (!allowed.includes(s)) {
      throw new BadRequestException(
        `Invalid status filter (use one of: ${allowed.join(', ')})`,
      );
    }
    return s as InvoiceStatus;
  }

  private async generateInvoiceNumber(manager: EntityManager): Promise<string> {
    const repo = manager.getRepository(SaleInvoice);
    while (true) {
      const invoiceNumber = `SI${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`;
      const existing = await repo.findOne({
        where: { invoiceNumber },
        select: ['id'],
      });
      if (!existing) {
        return invoiceNumber;
      }
    }
  }

  private async assertForeignKeys(
    tenantDb: DataSource,
    dto: CreateSaleInvoiceDto,
  ) {
    const distributor = await tenantDb.getRepository(Distributor).findOne({
      where: { id: dto.distributorId, isDeleted: false },
      select: ['id'],
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    const salesman = await tenantDb.getRepository(User).findOne({
      where: { id: dto.salesmanId, isDeleted: false },
      select: ['id'],
    });
    if (!salesman) throw new NotFoundException('Salesman not found');

    const retailer = await tenantDb.getRepository(Retailer).findOne({
      where: { id: dto.retailerId },
      select: ['id'],
    });
    if (!retailer) throw new NotFoundException('Retailer not found');

    const route = await tenantDb.getRepository(Route).findOne({
      where: { id: dto.routeId },
      select: ['id'],
    });
    if (!route) throw new NotFoundException('Route not found');

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

  private async assertItems(
    tenantDb: DataSource,
    items: CreateSaleInvoiceDto['items'],
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

      if (item.schemeId) {
        const scheme = await tenantDb.getRepository(Scheme).findOne({
          where: { id: item.schemeId },
          select: ['id'],
        });
        if (!scheme) {
          throw new NotFoundException(`Scheme ${item.schemeId} not found`);
        }
      }

      if (item.slabId) {
        const slab = await tenantDb.getRepository(SchemeSlab).findOne({
          where: { id: item.slabId },
          select: ['id'],
        });
        if (!slab) {
          throw new NotFoundException(`Scheme slab ${item.slabId} not found`);
        }
      }
    }
  }

  async list(
    tenantDb: DataSource,
    pageInput: number,
    limitInput: number,
    filters: {
      retailerId?: string;
      dateFrom?: string;
      dateTo?: string;
      invoiceStatus?: string;
      search?: string;
    },
    user: { userId: string },
  ) {
    const page = this.normalizePage(pageInput);
    const limit = this.normalizeLimit(limitInput);
    const retailerIds = this.parseRetailerIds(filters.retailerId);
    const dateFrom = this.parseOptionalDayBoundary(filters.dateFrom);
    const dateTo = this.parseOptionalDayBoundary(filters.dateTo);
    const statusFilter = this.parseOptionalInvoiceStatus(filters.invoiceStatus);

    const qb = tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('si')
      .leftJoinAndSelect('si.retailer', 'retailer')
      .leftJoinAndSelect('si.distributor', 'distributor')
      .leftJoinAndSelect('si.salesman', 'salesman');

    if (statusFilter) {
      qb.andWhere('si."invoiceStatus" = :invoiceStatus', {
        invoiceStatus: statusFilter,
      });
    }

    if (retailerIds?.length) {
      qb.andWhere('si."retailerId" IN (:...retailerIds)', { retailerIds });
    }

    const search = (filters.search ?? '').trim();
    if (search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('si."invoiceNumber" ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('retailer."shopName" ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    if (dateFrom) {
      qb.andWhere('si."invoiceDate" >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('si."invoiceDate" <= :dateTo', { dateTo: end });
    }

    const total = await qb.clone().getCount();

    const rows = await qb
      .clone()
      .select([
        'si.id',
        'si.invoiceNumber',
        'si.invoiceStatus',
        'si.invoiceDate',
        'si.totalAmount',
        'si.createdAt',
        'retailer.id',
        'retailer.shopName',
        'distributor.id',
        'distributor.name',
        'salesman.id',
        'salesman.name',
      ])
      .orderBy('si.invoiceDate', 'DESC')
      .addOrderBy('si.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_INVOICE_LISTED',
      description: 'Sale invoices listed',
      metadata: { total, page, limit },
    });

    return {
      result: rows,
      meta: { total, page, limit },
    };
  }

  async view(tenantDb: DataSource, id: string, user: { userId: string }) {
    const invoice = await tenantDb.getRepository(SaleInvoice).findOne({
      where: { id },
      relations: [
        'distributor',
        'salesman',
        'retailer',
        'route',
        'scheme',
        'schemeSlab',
        'saleOrder',
        'executedByUser',
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

    if (!invoice) {
      throw new NotFoundException('Sale invoice not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_INVOICE_VIEWED',
      description: `Sale invoice ${invoice.invoiceNumber} viewed`,
      metadata: { saleInvoiceId: invoice.id },
    });

    return invoice;
  }

  async create(
    tenantDb: DataSource,
    dto: CreateSaleInvoiceDto,
    user: { userId: string },
  ) {
    await this.assertForeignKeys(tenantDb, dto);
    await this.assertItems(tenantDb, dto.items);

    const saleInvoiceId = await tenantDb.transaction(async (manager) => {
      const invoiceRepo = manager.getRepository(SaleInvoice);
      const itemRepo = manager.getRepository(SaleInvoiceItem);

      const invoice = await invoiceRepo.save(
        invoiceRepo.create({
          invoiceNumber: await this.generateInvoiceNumber(manager),
          distributorId: dto.distributorId,
          salesmanId: dto.salesmanId,
          retailerId: dto.retailerId,
          routeId: dto.routeId,
          invoiceStatus: InvoiceStatus.UNPAID,
          saleOrderId: null,
          invoiceTotal: dto.invoiceTotal,
          taxPercentage: dto.taxPercentage ?? 0,
          taxAmount: dto.taxAmount ?? 0,
          discountPercentage: dto.discountPercentage ?? 0,
          discountAmount: dto.discountAmount ?? 0,
          totalDiscountAmount: dto.totalDiscountAmount ?? 0,
          totalTaxAmount: dto.totalTaxAmount ?? 0,
          subTotalAmount: dto.subTotalAmount,
          totalAmount: dto.totalAmount,
          schemeId: dto.schemeId ?? null,
          schemeSlabId: dto.schemeSlabId ?? null,
          notes: dto.notes?.trim() || null,
          invoiceDate: new Date(dto.invoiceDate),
        }),
      );

      await itemRepo.save(
        dto.items.map((item) =>
          itemRepo.create({
            saleInvoiceId: invoice.id,
            productId: item.productId.toString(),
            productFlavourId: item.productFlavourId.toString(),
            productPricingId: item.productPricingId.toString(),
            schemeId: item.schemeId ?? null,
            slabId: item.slabId ?? null,
            freeQuantity: item.freeQuantity ?? 0,
            quantity: item.quantity,
            discountPercentage: item.discountPercentage ?? 0,
            discountAmount: item.discountAmount ?? 0,
            taxPercentage: item.taxPercentage ?? 0,
            taxAmount: item.taxAmount ?? 0,
            subTotalAmount: item.subTotalAmount,
            totalAmount: item.totalAmount,
          }),
        ),
      );

      return invoice.id;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_INVOICE_CREATED',
      description: 'Sale invoice created',
      metadata: { saleInvoiceId },
    });

    return this.view(tenantDb, saleInvoiceId, user);
  }

  async updateStatus(
    tenantDb: DataSource,
    id: string,
    dto: UpdateSaleInvoiceStatusDto,
    user: { userId: string },
  ) {
    const outcome = await tenantDb.transaction(
      async (manager): Promise<'noop' | 'updated'> => {
        const repo = manager.getRepository(SaleInvoice);
        const invoice = await repo.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!invoice) {
          throw new NotFoundException('Sale invoice not found');
        }

        if (invoice.invoiceStatus === dto.invoiceStatus) {
          return 'noop';
        }

        invoice.invoiceStatus = dto.invoiceStatus;

        if (dto.invoiceStatus === InvoiceStatus.PAID) {
          invoice.executedBy = user.userId;
          invoice.executedDate = new Date();
        } else {
          invoice.executedBy = null;
          invoice.executedDate = null;
        }

        await repo.save(invoice);
        return 'updated';
      },
    );

    if (outcome === 'updated') {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'SALE_INVOICE_STATUS_UPDATED',
        description: 'Sale invoice status updated',
        metadata: { saleInvoiceId: id, invoiceStatus: dto.invoiceStatus },
      });
    }

    return this.view(tenantDb, id, user);
  }

  async createFromSaleOrder(
    manager: EntityManager,
    saleOrderId: string,
    _actorUserId: string,
  ): Promise<SaleInvoice> {
    const invoiceRepo = manager.getRepository(SaleInvoice);
    const existing = await invoiceRepo.findOne({
      where: { saleOrderId },
    });
    if (existing) {
      return existing;
    }

    const order = await manager.getRepository(SaleOrder).findOne({
      where: { id: saleOrderId },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    if (order.orderStatus !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Sale invoice can only be created from a delivered sale order',
      );
    }

    if (!order.items?.length) {
      throw new BadRequestException('Sale order has no items to invoice');
    }

    const subTotalAmount = Number(order.orderTotal ?? 0) - Number(order.discountAmount ?? 0);

    const invoice = await invoiceRepo.save(
      invoiceRepo.create({
        invoiceNumber: await this.generateInvoiceNumber(manager),
        distributorId: order.distributorId,
        salesmanId: order.salesmanId,
        retailerId: order.retailerId,
        routeId: order.routeId,
        invoiceStatus: InvoiceStatus.UNPAID,
        saleOrderId: order.id,
        invoiceTotal: order.orderTotal,
        taxPercentage: order.taxPercentage ?? 0,
        taxAmount: order.taxAmount ?? 0,
        discountPercentage: order.discountPercentage ?? 0,
        discountAmount: order.discountAmount ?? 0,
        totalDiscountAmount: order.discountAmount ?? 0,
        totalTaxAmount: order.taxAmount ?? 0,
        subTotalAmount,
        totalAmount: order.totalAmount,
        schemeId: order.schemeId ?? null,
        schemeSlabId: order.schemeSlabId ?? null,
        notes: order.notes ?? null,
        invoiceDate: order.deliveredDate ?? new Date(),
        executedBy: null,
        executedDate: null,
      }),
    );

    const itemRepo = manager.getRepository(SaleInvoiceItem);
    await itemRepo.save(
      order.items.map((orderItem) =>
        itemRepo.create({
          saleInvoiceId: invoice.id,
          productId: orderItem.productId,
          productFlavourId: orderItem.productFlavourId,
          productPricingId: orderItem.productPricingId,
          schemeId: orderItem.schemeId ?? null,
          slabId: orderItem.slabId ?? null,
          freeQuantity: 0,
          quantity: orderItem.quantity,
          discountPercentage: orderItem.discountPercentage ?? 0,
          discountAmount: orderItem.discountAmount ?? 0,
          taxPercentage: 0,
          taxAmount: 0,
          subTotalAmount: orderItem.totalAmount,
          totalAmount: orderItem.totalAmount,
        }),
      ),
    );

    const saved = await invoiceRepo.findOne({
      where: { id: invoice.id },
      relations: ['items'],
    });
    if (!saved) {
      throw new NotFoundException('Sale invoice not found after creation');
    }
    return saved;
  }
}
