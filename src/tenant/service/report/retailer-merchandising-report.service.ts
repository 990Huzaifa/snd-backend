import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, SelectQueryBuilder } from 'typeorm';
import { RetailerMerchandising } from 'src/tenant-db/entities/retailer.entity';
import {
  RetailerMerchandisingReportDto,
  RetailerMerchandisingReportType,
} from '../../dto/report/retailer-merchandising-report.dto';
import { ActivityLogService } from '../activity-log.service';

type MerchandisingFilterInput = {
  merchandiserId: string | null;
  routeId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string | null;
};

type SummaryRow = {
  totalMerchandising: string;
  uniqueRetailers: string;
  uniqueMerchandisers: string;
  withImages: string;
};

type GroupRow = {
  key: string;
  label: string;
  totalMerchandising: string;
  uniqueRetailers: string;
  withImages: string;
};

@Injectable()
export class RetailerMerchandisingReportService {
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

  private resolveFilters(
    dto: RetailerMerchandisingReportDto,
  ): MerchandisingFilterInput {
    const dateFrom = (dto.dateFrom ?? '').trim() || null;
    const dateTo = (dto.dateTo ?? '').trim() || null;

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    return {
      merchandiserId: (dto.merchandiserId ?? '').trim() || null,
      routeId: (dto.routeId ?? '').trim() || null,
      dateFrom,
      dateTo,
      search: (dto.search ?? '').trim() || null,
    };
  }

  private applyMerchandisingFilters(
    qb: SelectQueryBuilder<RetailerMerchandising>,
    filters: MerchandisingFilterInput,
    alias = 'rm',
  ) {
    if (filters.merchandiserId) {
      qb.andWhere(`${alias}."userId" = :merchandiserId`, {
        merchandiserId: filters.merchandiserId,
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
            })
            .orWhere('route.name ILIKE :search', {
              search: `%${filters.search}%`,
            });
        }),
      );
    }

    return qb;
  }

  private buildFilterQuery(
    tenantDb: DataSource,
    filters: MerchandisingFilterInput,
  ) {
    const qb = tenantDb
      .getRepository(RetailerMerchandising)
      .createQueryBuilder('rm')
      .innerJoin('rm.retailer', 'retailer')
      .innerJoin('rm.user', 'user')
      .innerJoin('retailer.route', 'route')
      .leftJoin('user.designation', 'designation');

    return this.applyMerchandisingFilters(qb, filters);
  }

  private buildListQuery(
    tenantDb: DataSource,
    filters: MerchandisingFilterInput,
  ) {
    const qb = tenantDb
      .getRepository(RetailerMerchandising)
      .createQueryBuilder('rm')
      .innerJoinAndSelect('rm.retailer', 'retailer')
      .innerJoinAndSelect('rm.user', 'user')
      .innerJoinAndSelect('retailer.route', 'route')
      .leftJoinAndSelect('user.designation', 'designation');

    return this.applyMerchandisingFilters(qb, filters);
  }

  private async fetchSummary(
    tenantDb: DataSource,
    filters: MerchandisingFilterInput,
  ) {
    const summary = (await this.buildFilterQuery(tenantDb, filters)
      .select('COUNT(rm.id)::int', 'totalMerchandising')
      .addSelect('COUNT(DISTINCT rm."retailerId")::int', 'uniqueRetailers')
      .addSelect('COUNT(DISTINCT rm."userId")::int', 'uniqueMerchandisers')
      .addSelect(
        `COALESCE(SUM(CASE WHEN rm."shelfImages" IS NOT NULL AND cardinality(rm."shelfImages") > 0 THEN 1 ELSE 0 END), 0)::int`,
        'withImages',
      )
      .getRawOne()) as SummaryRow;

    return {
      totalMerchandising: this.toNumber(summary?.totalMerchandising),
      uniqueRetailers: this.toNumber(summary?.uniqueRetailers),
      uniqueMerchandisers: this.toNumber(summary?.uniqueMerchandisers),
      withImages: this.toNumber(summary?.withImages),
    };
  }

  private async fetchGroups(
    tenantDb: DataSource,
    filters: MerchandisingFilterInput,
    reportType: RetailerMerchandisingReportType,
  ) {
    const groupQb = this.buildFilterQuery(tenantDb, filters)
      .select('COUNT(rm.id)::int', 'totalMerchandising')
      .addSelect('COUNT(DISTINCT rm."retailerId")::int', 'uniqueRetailers')
      .addSelect(
        `COALESCE(SUM(CASE WHEN rm."shelfImages" IS NOT NULL AND cardinality(rm."shelfImages") > 0 THEN 1 ELSE 0 END), 0)::int`,
        'withImages',
      );

    switch (reportType) {
      case RetailerMerchandisingReportType.MERCHANDISER_WISE:
        groupQb
          .addSelect('rm."userId"', 'key')
          .addSelect('"user".name', 'label')
          .groupBy('rm."userId"')
          .addGroupBy('"user".name')
          .orderBy('"user".name', 'ASC');
        break;
      case RetailerMerchandisingReportType.ROUTE_WISE:
        groupQb
          .addSelect('retailer."routeId"', 'key')
          .addSelect('route.name', 'label')
          .groupBy('retailer."routeId"')
          .addGroupBy('route.name')
          .orderBy('route.name', 'ASC');
        break;
      case RetailerMerchandisingReportType.DAY_WISE:
      default:
        groupQb
          .addSelect(`TO_CHAR(rm."createdAt", 'YYYY-MM-DD')`, 'key')
          .addSelect(`TO_CHAR(rm."createdAt", 'YYYY-MM-DD')`, 'label')
          .groupBy(`TO_CHAR(rm."createdAt", 'YYYY-MM-DD')`)
          .orderBy(`TO_CHAR(rm."createdAt", 'YYYY-MM-DD')`, 'DESC');
        break;
    }

    const rows = (await groupQb.getRawMany()) as GroupRow[];

    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      totalMerchandising: this.toNumber(row.totalMerchandising),
      uniqueRetailers: this.toNumber(row.uniqueRetailers),
      withImages: this.toNumber(row.withImages),
    }));
  }

  async getOverview(
    tenantDb: DataSource,
    dto: RetailerMerchandisingReportDto,
    user: { userId: string },
  ) {
    const page = this.normalizePage(dto.page);
    const limit = this.normalizeLimit(dto.limit);
    const filters = this.resolveFilters(dto);
    const reportType =
      dto.reportType ?? RetailerMerchandisingReportType.DAY_WISE;

    const [summary, groups, total] = await Promise.all([
      this.fetchSummary(tenantDb, filters),
      this.fetchGroups(tenantDb, filters, reportType),
      this.buildFilterQuery(tenantDb, filters).getCount(),
    ]);

    const records = await this.buildListQuery(tenantDb, filters)
      .orderBy('rm.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const rows = records.map((entry) => ({
      id: entry.id,
      merchandisingDate: entry.createdAt,
      retailer: {
        id: entry.retailer.id,
        shopName: entry.retailer.shopName,
        code: entry.retailer.id,
        address: entry.retailer.address,
      },
      merchandiser: {
        id: entry.user.id,
        name: entry.user.name,
        code: entry.user.code,
        type: entry.user.type,
        designation: entry.user.designation
          ? {
              id: entry.user.designation.id,
              name: entry.user.designation.name,
            }
          : null,
      },
      route: {
        id: entry.retailer.route.id,
        name: entry.retailer.route.name,
      },
      notes: entry.notes,
      shelfImages: entry.shelfImages,
      imageCount: entry.shelfImages?.length ?? 0,
    }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_MERCHANDISING_REPORT_VIEWED',
      description: 'Retailer merchandising report viewed',
      metadata: {
        reportType,
        totalMerchandising: summary.totalMerchandising,
        page,
        limit,
      },
    });

    return {
      filters: {
        reportType,
        merchandiserId: filters.merchandiserId,
        routeId: filters.routeId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
      },
      summary,
      groups,
      merchandising: rows,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }

  async getMerchandisingDetail(
    tenantDb: DataSource,
    id: string,
    user: { userId: string },
  ) {
    const entry = await tenantDb.getRepository(RetailerMerchandising).findOne({
      where: { id },
      relations: [
        'retailer',
        'retailer.retailerCategory',
        'retailer.retailerChannel',
        'retailer.route',
        'retailer.route.area',
        'user',
        'user.designation',
      ],
    });

    if (!entry) {
      throw new NotFoundException('Retailer merchandising record not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_MERCHANDISING_REPORT_DETAIL_VIEWED',
      description: 'Retailer merchandising report detail viewed',
      metadata: { retailerMerchandisingId: entry.id },
    });

    return {
      id: entry.id,
      merchandisingDate: entry.createdAt,
      notes: entry.notes,
      shelfImages: entry.shelfImages,
      imageCount: entry.shelfImages?.length ?? 0,
      retailer: {
        id: entry.retailer.id,
        shopName: entry.retailer.shopName,
        code: entry.retailer.id,
        ownerName: entry.retailer.ownerName,
        address: entry.retailer.address,
        phone: entry.retailer.phone,
        image: entry.retailer.image,
        category: entry.retailer.retailerCategory
          ? {
              id: entry.retailer.retailerCategory.id,
              name: entry.retailer.retailerCategory.name,
            }
          : null,
        channel: entry.retailer.retailerChannel
          ? {
              id: entry.retailer.retailerChannel.id,
              name: entry.retailer.retailerChannel.name,
            }
          : null,
      },
      merchandiser: {
        id: entry.user.id,
        name: entry.user.name,
        code: entry.user.code,
        type: entry.user.type,
        designation: entry.user.designation
          ? {
              id: entry.user.designation.id,
              name: entry.user.designation.name,
            }
          : null,
      },
      route: {
        id: entry.retailer.route.id,
        name: entry.retailer.route.name,
        area: entry.retailer.route.area
          ? {
              id: entry.retailer.route.area.id,
              name: entry.retailer.route.area.name,
            }
          : null,
      },
    };
  }
}
