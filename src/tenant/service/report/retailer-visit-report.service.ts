import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, SelectQueryBuilder } from 'typeorm';
import {
  RetailerMerchandising,
  RetailerVisit,
  RetailerVisitStatus,
} from 'src/tenant-db/entities/retailer.entity';
import { SaleOrder } from 'src/tenant-db/entities/saleorder.entity';
import {
  RetailerVisitReportDto,
  RetailerVisitReportType,
} from '../../dto/report/retailer-visit-report.dto';
import { ActivityLogService } from '../activity-log.service';

type VisitFilterInput = {
  salesmanId: string | null;
  routeId: string | null;
  status: RetailerVisitStatus | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string | null;
};

type SummaryRow = {
  totalVisits: string;
  ordersBooked: string;
  noSale: string;
};

type GroupRow = {
  key: string;
  label: string;
  totalVisits: string;
  ordersBooked: string;
  noSale: string;
};

const VISIT_STATUS_LABELS: Record<RetailerVisitStatus, string> = {
  [RetailerVisitStatus.ORDER_BOOKED]: 'Order Booked',
  [RetailerVisitStatus.NO_SALE]: 'No Sale',
  [RetailerVisitStatus.SHOP_CLOSED]: 'Shop Closed',
  [RetailerVisitStatus.OWNER_ABSENT]: 'Owner Not Available',
  [RetailerVisitStatus.STOCK_FULL]: 'Stock Full',
  [RetailerVisitStatus.RETURN_BOOKED]: 'Return Booked',
};

@Injectable()
export class RetailerVisitReportService {
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

  private toNumber(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private parseDateBoundary(
    value: string | undefined,
    endOfDay: boolean,
  ): Date | null {
    const normalized = (value ?? '').trim();
    if (!normalized) {
      return null;
    }

    const date = new Date(
      endOfDay ? `${normalized}T23:59:59.999Z` : `${normalized}T00:00:00.000Z`,
    );
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return date;
  }

  private resolveFilters(dto: RetailerVisitReportDto): VisitFilterInput {
    const dateFrom = (dto.dateFrom ?? '').trim() || null;
    const dateTo = (dto.dateTo ?? '').trim() || null;

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    return {
      salesmanId: (dto.salesmanId ?? '').trim() || null,
      routeId: (dto.routeId ?? '').trim() || null,
      status: dto.status ?? null,
      dateFrom,
      dateTo,
      search: (dto.search ?? '').trim() || null,
    };
  }

  private applyVisitFilters(
    qb: SelectQueryBuilder<RetailerVisit>,
    filters: VisitFilterInput,
    alias = 'rv',
  ) {
    if (filters.salesmanId) {
      qb.andWhere(`${alias}."userId" = :salesmanId`, {
        salesmanId: filters.salesmanId,
      });
    }

    if (filters.routeId) {
      qb.andWhere(`${alias}."routeId" = :routeId`, {
        routeId: filters.routeId,
      });
    }

    if (filters.status) {
      qb.andWhere(`${alias}."visitStatus" = :visitStatus`, {
        visitStatus: filters.status,
      });
    }

    const dateFrom = this.parseDateBoundary(filters.dateFrom ?? undefined, false);
    const dateTo = this.parseDateBoundary(filters.dateTo ?? undefined, true);

    if (dateFrom) {
      qb.andWhere(`${alias}."createdAt" >= :dateFrom`, { dateFrom });
    }

    if (dateTo) {
      qb.andWhere(`${alias}."createdAt" <= :dateTo`, { dateTo });
    }

    if (filters.search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('retailer."shopName" ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('retailer.id::text ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('"user".name ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('"user".code ILIKE :search', {
              search: `%${filters.search}%`,
            });
        }),
      );
    }

    return qb;
  }

  private applyMerchandisingFilters(
    qb: SelectQueryBuilder<RetailerMerchandising>,
    filters: VisitFilterInput,
  ) {
    if (filters.salesmanId) {
      qb.andWhere('rm."userId" = :salesmanId', {
        salesmanId: filters.salesmanId,
      });
    }

    if (filters.routeId) {
      qb.andWhere('retailer."routeId" = :routeId', {
        routeId: filters.routeId,
      });
    }

    const dateFrom = this.parseDateBoundary(filters.dateFrom ?? undefined, false);
    const dateTo = this.parseDateBoundary(filters.dateTo ?? undefined, true);

    if (dateFrom) {
      qb.andWhere('rm."createdAt" >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      qb.andWhere('rm."createdAt" <= :dateTo', { dateTo });
    }

    if (filters.search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('retailer."shopName" ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('retailer.id::text ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('"user".name ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('"user".code ILIKE :search', {
              search: `%${filters.search}%`,
            });
        }),
      );
    }

    return qb;
  }

  private buildVisitFilterQuery(
    tenantDb: DataSource,
    filters: VisitFilterInput,
  ) {
    const qb = tenantDb
      .getRepository(RetailerVisit)
      .createQueryBuilder('rv')
      .innerJoin('rv.retailer', 'retailer')
      .innerJoin('rv.user', 'user')
      .innerJoin('rv.route', 'route')
      .leftJoin('user.designation', 'designation');

    return this.applyVisitFilters(qb, filters);
  }

  private buildVisitListQuery(
    tenantDb: DataSource,
    filters: VisitFilterInput,
  ) {
    const qb = tenantDb
      .getRepository(RetailerVisit)
      .createQueryBuilder('rv')
      .innerJoinAndSelect('rv.retailer', 'retailer')
      .innerJoinAndSelect('rv.user', 'user')
      .innerJoinAndSelect('rv.route', 'route')
      .leftJoinAndSelect('user.designation', 'designation');

    return this.applyVisitFilters(qb, filters);
  }

  private async fetchSummary(
    tenantDb: DataSource,
    filters: VisitFilterInput,
  ) {
    const summaryQb = this.buildVisitFilterQuery(tenantDb, filters)
      .select('COUNT(rv.id)::int', 'totalVisits')
      .addSelect(
        `COALESCE(SUM(CASE WHEN rv."visitStatus" = :orderBooked THEN 1 ELSE 0 END), 0)::int`,
        'ordersBooked',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rv."visitStatus" = :noSale THEN 1 ELSE 0 END), 0)::int`,
        'noSale',
      )
      .setParameter('orderBooked', RetailerVisitStatus.ORDER_BOOKED)
      .setParameter('noSale', RetailerVisitStatus.NO_SALE);

    const summary = (await summaryQb.getRawOne()) as SummaryRow;

    const merchandizedQb = tenantDb
      .getRepository(RetailerMerchandising)
      .createQueryBuilder('rm')
      .innerJoin('rm.retailer', 'retailer')
      .innerJoin('rm.user', 'user')
      .select('COUNT(rm.id)::int', 'merchandized');

    this.applyMerchandisingFilters(merchandizedQb, filters);

    const merchandizedRow = await merchandizedQb.getRawOne<{ merchandized: string }>();

    return {
      totalVisits: this.toNumber(summary?.totalVisits),
      ordersBooked: this.toNumber(summary?.ordersBooked),
      noSale: this.toNumber(summary?.noSale),
      merchandized: this.toNumber(merchandizedRow?.merchandized),
    };
  }

  private async fetchGroups(
    tenantDb: DataSource,
    filters: VisitFilterInput,
    reportType: RetailerVisitReportType,
  ) {
    const groupQb = this.buildVisitFilterQuery(tenantDb, filters)
      .select('COUNT(rv.id)::int', 'totalVisits')
      .addSelect(
        `COALESCE(SUM(CASE WHEN rv."visitStatus" = :orderBooked THEN 1 ELSE 0 END), 0)::int`,
        'ordersBooked',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rv."visitStatus" = :noSale THEN 1 ELSE 0 END), 0)::int`,
        'noSale',
      )
      .setParameter('orderBooked', RetailerVisitStatus.ORDER_BOOKED)
      .setParameter('noSale', RetailerVisitStatus.NO_SALE);

    switch (reportType) {
      case RetailerVisitReportType.SALESMAN_WISE:
        groupQb
          .addSelect('rv."userId"', 'key')
          .addSelect('"user".name', 'label')
          .groupBy('rv."userId"')
          .addGroupBy('"user".name')
          .orderBy('"user".name', 'ASC');
        break;
      case RetailerVisitReportType.ROUTE_WISE:
        groupQb
          .addSelect('rv."routeId"', 'key')
          .addSelect('route.name', 'label')
          .groupBy('rv."routeId"')
          .addGroupBy('route.name')
          .orderBy('route.name', 'ASC');
        break;
      case RetailerVisitReportType.STATUS_WISE:
        groupQb
          .addSelect('rv."visitStatus"', 'key')
          .addSelect('rv."visitStatus"', 'label')
          .groupBy('rv."visitStatus"')
          .orderBy('rv."visitStatus"', 'ASC');
        break;
      case RetailerVisitReportType.DAY_WISE:
      default:
        groupQb
          .addSelect(`TO_CHAR(rv."createdAt", 'YYYY-MM-DD')`, 'key')
          .addSelect(`TO_CHAR(rv."createdAt", 'YYYY-MM-DD')`, 'label')
          .groupBy(`TO_CHAR(rv."createdAt", 'YYYY-MM-DD')`)
          .orderBy(`TO_CHAR(rv."createdAt", 'YYYY-MM-DD')`, 'DESC');
        break;
    }

    const rows = (await groupQb.getRawMany()) as GroupRow[];

    return rows.map((row) => ({
      key: row.key,
      label:
        reportType === RetailerVisitReportType.STATUS_WISE
          ? VISIT_STATUS_LABELS[row.label as RetailerVisitStatus] ?? row.label
          : row.label,
      totalVisits: this.toNumber(row.totalVisits),
      ordersBooked: this.toNumber(row.ordersBooked),
      noSale: this.toNumber(row.noSale),
    }));
  }

  private async resolveOrderAmounts(
    tenantDb: DataSource,
    visitIds: string[],
  ): Promise<Map<string, number>> {
    if (!visitIds.length) {
      return new Map();
    }

    const rows = await tenantDb
      .getRepository(RetailerVisit)
      .createQueryBuilder('rv')
      .select('rv.id', 'visitId')
      .addSelect('COALESCE(SUM(so."totalAmount"), 0)', 'orderAmount')
      .leftJoin(
        SaleOrder,
        'so',
        `so."retailerId" = rv."retailerId"
         AND so."salesmanId" = rv."userId"
         AND DATE(so."createdAt") = DATE(rv."createdAt")`,
      )
      .where('rv.id IN (:...visitIds)', { visitIds })
      .andWhere('rv."visitStatus" = :orderBooked', {
        orderBooked: RetailerVisitStatus.ORDER_BOOKED,
      })
      .groupBy('rv.id')
      .getRawMany<{ visitId: string; orderAmount: string }>();

    return new Map(
      rows.map((row) => [row.visitId, this.toNumber(row.orderAmount)]),
    );
  }

  async getOverview(
    tenantDb: DataSource,
    dto: RetailerVisitReportDto,
    user: { userId: string },
  ) {
    const page = this.normalizePage(dto.page);
    const limit = this.normalizeLimit(dto.limit);
    const filters = this.resolveFilters(dto);
    const reportType = dto.reportType ?? RetailerVisitReportType.DAY_WISE;

    const [summary, groups, total] = await Promise.all([
      this.fetchSummary(tenantDb, filters),
      this.fetchGroups(tenantDb, filters, reportType),
      this.buildVisitFilterQuery(tenantDb, filters).getCount(),
    ]);

    const visits = await this.buildVisitListQuery(tenantDb, filters)
      .orderBy('rv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const orderAmounts = await this.resolveOrderAmounts(
      tenantDb,
      visits.map((visit) => visit.id),
    );

    const visitRows = visits.map((visit) => ({
      id: visit.id,
      visitDate: visit.createdAt,
      retailer: {
        id: visit.retailer.id,
        shopName: visit.retailer.shopName,
        code: visit.retailer.id,
        address: visit.retailer.address,
      },
      salesman: {
        id: visit.user.id,
        name: visit.user.name,
        code: visit.user.code,
        type: visit.user.type,
        designation: visit.user.designation
          ? {
              id: visit.user.designation.id,
              name: visit.user.designation.name,
            }
          : null,
      },
      route: {
        id: visit.route.id,
        name: visit.route.name,
      },
      status: visit.visitStatus,
      statusLabel: VISIT_STATUS_LABELS[visit.visitStatus],
      orderAmount:
        visit.visitStatus === RetailerVisitStatus.ORDER_BOOKED
          ? orderAmounts.get(visit.id) ?? 0
          : null,
      notes: visit.notes,
      shopImages: visit.shopImages,
      shelfImages: visit.shelfImages,
    }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_VISIT_REPORT_VIEWED',
      description: 'Retailer visit report viewed',
      metadata: {
        reportType,
        totalVisits: summary.totalVisits,
        page,
        limit,
      },
    });

    return {
      filters: {
        reportType,
        salesmanId: filters.salesmanId,
        routeId: filters.routeId,
        status: filters.status,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
      },
      summary,
      groups,
      visits: visitRows,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }

  async getVisitDetail(
    tenantDb: DataSource,
    id: string,
    user: { userId: string },
  ) {
    const visit = await tenantDb.getRepository(RetailerVisit).findOne({
      where: { id },
      relations: [
        'retailer',
        'retailer.retailerCategory',
        'retailer.retailerChannel',
        'route',
        'route.area',
        'user',
        'user.designation',
      ],
    });

    if (!visit) {
      throw new NotFoundException('Retailer visit not found');
    }

    const orderAmounts = await this.resolveOrderAmounts(tenantDb, [visit.id]);
    const orderAmount =
      visit.visitStatus === RetailerVisitStatus.ORDER_BOOKED
        ? orderAmounts.get(visit.id) ?? 0
        : null;

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_VISIT_REPORT_DETAIL_VIEWED',
      description: 'Retailer visit report detail viewed',
      metadata: { retailerVisitId: visit.id },
    });

    return {
      id: visit.id,
      visitDate: visit.createdAt,
      status: visit.visitStatus,
      statusLabel: VISIT_STATUS_LABELS[visit.visitStatus],
      notes: visit.notes,
      shopImages: visit.shopImages,
      shelfImages: visit.shelfImages,
      orderAmount,
      retailer: {
        id: visit.retailer.id,
        shopName: visit.retailer.shopName,
        code: visit.retailer.id,
        ownerName: visit.retailer.ownerName,
        address: visit.retailer.address,
        phone: visit.retailer.phone,
        image: visit.retailer.image,
        category: visit.retailer.retailerCategory
          ? {
              id: visit.retailer.retailerCategory.id,
              name: visit.retailer.retailerCategory.name,
            }
          : null,
        channel: visit.retailer.retailerChannel
          ? {
              id: visit.retailer.retailerChannel.id,
              name: visit.retailer.retailerChannel.name,
            }
          : null,
      },
      salesman: {
        id: visit.user.id,
        name: visit.user.name,
        code: visit.user.code,
        type: visit.user.type,
        designation: visit.user.designation
          ? {
              id: visit.user.designation.id,
              name: visit.user.designation.name,
            }
          : null,
      },
      route: {
        id: visit.route.id,
        name: visit.route.name,
        area: visit.route.area
          ? {
              id: visit.route.area.id,
              name: visit.route.area.name,
            }
          : null,
      },
    };
  }
}
