import { BadRequestException, Injectable } from '@nestjs/common';
import { Brackets, DataSource, In, SelectQueryBuilder } from 'typeorm';
import { PJPRoute } from 'src/tenant-db/entities/pjp.entity';
import { RetailerAttendence } from 'src/tenant-db/entities/retailer.entity';
import {
  RetailerCheckInReportDto,
  RetailerCheckInReportType,
} from '../../dto/report/retailer-checkin-report.dto';
import { ActivityLogService } from '../activity-log.service';

type CheckInFilterInput = {
  salesmanId: string | null;
  routeId: string | null;
  distributorId: string | null;
  areaId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string | null;
};

type SummaryRow = {
  totalCheckIns: string;
  uniqueRetailers: string;
  uniqueRoutes: string;
  uniqueSalesmen: string;
};

type ChartCountRow = {
  key: string;
  label: string;
  count: string;
};

type GroupRow = {
  key: string;
  label: string;
  totalCheckIns: string;
  uniqueRetailers: string;
};

const DAY_OF_WEEK_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

@Injectable()
export class RetailerCheckInReportService {
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

  private resolveFilters(dto: RetailerCheckInReportDto): CheckInFilterInput {
    const dateFrom = (dto.dateFrom ?? '').trim() || null;
    const dateTo = (dto.dateTo ?? '').trim() || null;

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    return {
      salesmanId: (dto.salesmanId ?? '').trim() || null,
      routeId: (dto.routeId ?? '').trim() || null,
      distributorId: (dto.distributorId ?? '').trim() || null,
      areaId: (dto.areaId ?? '').trim() || null,
      dateFrom,
      dateTo,
      search: (dto.search ?? '').trim() || null,
    };
  }

  private readonly pjpRouteJoinOn = `
    "pjpRoute"."routeId" = "retailer"."routeId"
    AND DATE("pjpRoute"."visitDate") = DATE(ra."attendenceDate")
  `;

  private applyCheckInJoins(qb: SelectQueryBuilder<RetailerAttendence>) {
    return qb
      .innerJoin('ra.retailer', 'retailer')
      .innerJoin('retailer.route', 'route')
      .innerJoin('route.area', 'area')
      .innerJoin('route.distributor', 'distributor')
      .leftJoin(PJPRoute, 'pjpRoute', this.pjpRouteJoinOn)
      .leftJoin('pjpRoute.pjp', 'pjp')
      .leftJoin('pjp.salesman', 'salesman');
  }

  private applyCheckInFilters(
    qb: SelectQueryBuilder<RetailerAttendence>,
    filters: CheckInFilterInput,
  ) {
    if (filters.salesmanId) {
      qb.andWhere('salesman.id = :salesmanId', {
        salesmanId: filters.salesmanId,
      });
    }

    if (filters.routeId) {
      qb.andWhere('route.id = :routeId', { routeId: filters.routeId });
    }

    if (filters.distributorId) {
      qb.andWhere('distributor.id = :distributorId', {
        distributorId: filters.distributorId,
      });
    }

    if (filters.areaId) {
      qb.andWhere('area.id = :areaId', { areaId: filters.areaId });
    }

    const dateFrom = this.parseDateBoundary(filters.dateFrom ?? undefined, false);
    const dateTo = this.parseDateBoundary(filters.dateTo ?? undefined, true);

    if (dateFrom) {
      qb.andWhere('ra."attendenceDate" >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      qb.andWhere('ra."attendenceDate" <= :dateTo', { dateTo });
    }

    if (filters.search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('retailer."shopName" ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('retailer.address ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('retailer.id::text ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('route.name ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('salesman.name ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('salesman.code ILIKE :search', {
              search: `%${filters.search}%`,
            });
        }),
      );
    }

    return qb;
  }

  private buildCheckInFilterQuery(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
  ) {
    const qb = tenantDb
      .getRepository(RetailerAttendence)
      .createQueryBuilder('ra');

    this.applyCheckInJoins(qb);
    return this.applyCheckInFilters(qb, filters);
  }

  private async countCheckIns(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
  ): Promise<number> {
    const row = await this.buildCheckInFilterQuery(tenantDb, filters)
      .select('COUNT(DISTINCT ra.id)', 'cnt')
      .getRawOne<{ cnt: string }>();
    return this.toNumber(row?.cnt);
  }

  private async fetchSummary(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
  ) {
    const summary = (await this.buildCheckInFilterQuery(tenantDb, filters)
      .select('COUNT(DISTINCT ra.id)::int', 'totalCheckIns')
      .addSelect('COUNT(DISTINCT ra."retailerId")::int', 'uniqueRetailers')
      .addSelect('COUNT(DISTINCT retailer."routeId")::int', 'uniqueRoutes')
      .addSelect('COUNT(DISTINCT salesman.id)::int', 'uniqueSalesmen')
      .getRawOne()) as SummaryRow;

    const totalCheckIns = this.toNumber(summary?.totalCheckIns);
    const daySpan = await this.resolveDaySpan(tenantDb, filters);

    return {
      totalCheckIns,
      uniqueRetailers: this.toNumber(summary?.uniqueRetailers),
      uniqueRoutes: this.toNumber(summary?.uniqueRoutes),
      uniqueSalesmen: this.toNumber(summary?.uniqueSalesmen),
      avgCheckInsPerDay:
        daySpan > 0 ? Math.round((totalCheckIns / daySpan) * 100) / 100 : 0,
    };
  }

  private async resolveDaySpan(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
  ): Promise<number> {
    if (filters.dateFrom && filters.dateTo) {
      const from = new Date(`${filters.dateFrom}T00:00:00.000Z`);
      const to = new Date(`${filters.dateTo}T00:00:00.000Z`);
      const diffMs = to.getTime() - from.getTime();
      return Math.max(Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1, 1);
    }

    const range = await this.buildCheckInFilterQuery(tenantDb, filters)
      .select('MIN(ra."attendenceDate")', 'minDate')
      .addSelect('MAX(ra."attendenceDate")', 'maxDate')
      .getRawOne<{ minDate: string | null; maxDate: string | null }>();

    if (!range?.minDate || !range?.maxDate) {
      return 0;
    }

    const from = new Date(range.minDate);
    const to = new Date(range.maxDate);
    const diffMs = to.getTime() - from.getTime();
    return Math.max(Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1, 1);
  }

  private async fetchTrendChart(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
  ) {
    const rows = (await this.buildCheckInFilterQuery(tenantDb, filters)
      .select(`TO_CHAR(ra."attendenceDate", 'YYYY-MM-DD')`, 'key')
      .addSelect(`TO_CHAR(ra."attendenceDate", 'YYYY-MM-DD')`, 'label')
      .addSelect('COUNT(DISTINCT ra.id)::int', 'count')
      .groupBy(`TO_CHAR(ra."attendenceDate", 'YYYY-MM-DD')`)
      .orderBy(`TO_CHAR(ra."attendenceDate", 'YYYY-MM-DD')`, 'ASC')
      .getRawMany()) as ChartCountRow[];

    return rows.map((row) => ({
      date: row.key,
      label: row.label,
      count: this.toNumber(row.count),
    }));
  }

  private async fetchRouteChart(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
    limit = 10,
  ) {
    const rows = (await this.buildCheckInFilterQuery(tenantDb, filters)
      .select('route.id', 'key')
      .addSelect('route.name', 'label')
      .addSelect('COUNT(DISTINCT ra.id)::int', 'cnt')
      .groupBy('route.id')
      .addGroupBy('route.name')
      .orderBy('COUNT(DISTINCT ra.id)', 'DESC')
      .limit(limit)
      .getRawMany()) as Array<{ key: string; label: string; cnt: string }>;

    return rows.map((row) => ({
      routeId: row.key,
      routeName: row.label,
      count: this.toNumber(row.cnt),
    }));
  }

  private async fetchSalesmanChart(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
    limit = 10,
  ) {
    const rows = (await this.buildCheckInFilterQuery(tenantDb, filters)
      .select('salesman.id', 'key')
      .addSelect('salesman.name', 'label')
      .addSelect('COUNT(DISTINCT ra.id)::int', 'cnt')
      .andWhere('salesman.id IS NOT NULL')
      .groupBy('salesman.id')
      .addGroupBy('salesman.name')
      .orderBy('COUNT(DISTINCT ra.id)', 'DESC')
      .limit(limit)
      .getRawMany()) as Array<{ key: string; label: string; cnt: string }>;

    return rows.map((row) => ({
      salesmanId: row.key,
      salesmanName: row.label,
      count: this.toNumber(row.cnt),
    }));
  }

  private async fetchDayOfWeekChart(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
  ) {
    const rows = await this.buildCheckInFilterQuery(tenantDb, filters)
      .select('EXTRACT(DOW FROM ra."attendenceDate")::int', 'dayIndex')
      .addSelect('COUNT(DISTINCT ra.id)::int', 'cnt')
      .groupBy('EXTRACT(DOW FROM ra."attendenceDate")')
      .orderBy('EXTRACT(DOW FROM ra."attendenceDate")', 'ASC')
      .getRawMany<{ dayIndex: string; cnt: string }>();

    const countByDay = new Map(
      rows.map((row) => [this.toNumber(row.dayIndex), this.toNumber(row.cnt)]),
    );

    return DAY_OF_WEEK_LABELS.map((label, dayIndex) => ({
      dayIndex,
      label,
      count: countByDay.get(dayIndex) ?? 0,
    }));
  }

  private async fetchHourlyChart(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
  ) {
    const rows = await this.buildCheckInFilterQuery(tenantDb, filters)
      .select('EXTRACT(HOUR FROM ra."createdAt")::int', 'hour')
      .addSelect('COUNT(DISTINCT ra.id)::int', 'cnt')
      .groupBy('EXTRACT(HOUR FROM ra."createdAt")')
      .orderBy('EXTRACT(HOUR FROM ra."createdAt")', 'ASC')
      .getRawMany<{ hour: string; cnt: string }>();

    const countByHour = new Map(
      rows.map((row) => [this.toNumber(row.hour), this.toNumber(row.cnt)]),
    );

    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      count: countByHour.get(hour) ?? 0,
    }));
  }

  private async fetchGroups(
    tenantDb: DataSource,
    filters: CheckInFilterInput,
    reportType: RetailerCheckInReportType,
  ) {
    const groupQb = this.buildCheckInFilterQuery(tenantDb, filters)
      .select('COUNT(DISTINCT ra.id)::int', 'totalCheckIns')
      .addSelect('COUNT(DISTINCT ra."retailerId")::int', 'uniqueRetailers');

    switch (reportType) {
      case RetailerCheckInReportType.SALESMAN_WISE:
        groupQb
          .addSelect('salesman.id', 'key')
          .addSelect('salesman.name', 'label')
          .andWhere('salesman.id IS NOT NULL')
          .groupBy('salesman.id')
          .addGroupBy('salesman.name')
          .orderBy('salesman.name', 'ASC');
        break;
      case RetailerCheckInReportType.ROUTE_WISE:
        groupQb
          .addSelect('route.id', 'key')
          .addSelect('route.name', 'label')
          .groupBy('route.id')
          .addGroupBy('route.name')
          .orderBy('route.name', 'ASC');
        break;
      case RetailerCheckInReportType.RETAILER_WISE:
        groupQb
          .addSelect('retailer.id', 'key')
          .addSelect('retailer."shopName"', 'label')
          .groupBy('retailer.id')
          .addGroupBy('retailer."shopName"')
          .orderBy('retailer."shopName"', 'ASC');
        break;
      case RetailerCheckInReportType.DAY_WISE:
      default:
        groupQb
          .addSelect(`TO_CHAR(ra."attendenceDate", 'YYYY-MM-DD')`, 'key')
          .addSelect(`TO_CHAR(ra."attendenceDate", 'YYYY-MM-DD')`, 'label')
          .groupBy(`TO_CHAR(ra."attendenceDate", 'YYYY-MM-DD')`)
          .orderBy(`TO_CHAR(ra."attendenceDate", 'YYYY-MM-DD')`, 'DESC');
        break;
    }

    const rows = (await groupQb.getRawMany()) as GroupRow[];

    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      totalCheckIns: this.toNumber(row.totalCheckIns),
      uniqueRetailers: this.toNumber(row.uniqueRetailers),
    }));
  }

  private async fetchSalesmanMap(
    tenantDb: DataSource,
    checkInIds: string[],
  ): Promise<
    Map<
      string,
      { id: string; name: string; code: string; type: string } | null
    >
  > {
    if (!checkInIds.length) {
      return new Map();
    }

    const rows = await tenantDb
      .getRepository(RetailerAttendence)
      .createQueryBuilder('ra')
      .select('ra.id', 'checkInId')
      .addSelect('salesman.id', 'salesmanId')
      .addSelect('salesman.name', 'salesmanName')
      .addSelect('salesman.code', 'salesmanCode')
      .addSelect('salesman.type', 'salesmanType')
      .innerJoin('ra.retailer', 'retailer')
      .leftJoin(PJPRoute, 'pjpRoute', this.pjpRouteJoinOn)
      .leftJoin('pjpRoute.pjp', 'pjp')
      .leftJoin('pjp.salesman', 'salesman')
      .where('ra.id IN (:...checkInIds)', { checkInIds })
      .getRawMany<{
        checkInId: string;
        salesmanId: string | null;
        salesmanName: string | null;
        salesmanCode: string | null;
        salesmanType: string | null;
      }>();

    return new Map(
      rows.map((row) => [
        row.checkInId,
        row.salesmanId
          ? {
              id: row.salesmanId,
              name: row.salesmanName ?? '',
              code: row.salesmanCode ?? '',
              type: row.salesmanType ?? '',
            }
          : null,
      ]),
    );
  }

  async getOverview(
    tenantDb: DataSource,
    dto: RetailerCheckInReportDto,
    user: { userId: string },
  ) {
    const page = this.normalizePage(dto.page);
    const limit = this.normalizeLimit(dto.limit);
    const filters = this.resolveFilters(dto);
    const reportType = dto.reportType ?? RetailerCheckInReportType.DAY_WISE;

    const [
      summary,
      groups,
      total,
      trend,
      byRoute,
      bySalesman,
      byDayOfWeek,
      byHour,
    ] = await Promise.all([
      this.fetchSummary(tenantDb, filters),
      this.fetchGroups(tenantDb, filters, reportType),
      this.countCheckIns(tenantDb, filters),
      this.fetchTrendChart(tenantDb, filters),
      this.fetchRouteChart(tenantDb, filters),
      this.fetchSalesmanChart(tenantDb, filters),
      this.fetchDayOfWeekChart(tenantDb, filters),
      this.fetchHourlyChart(tenantDb, filters),
    ]);

    const checkInIds = (
      await this.buildCheckInFilterQuery(tenantDb, filters)
        .select('ra.id', 'id')
        .addSelect('MAX(ra."attendenceDate")', 'attendenceDate')
        .addSelect('MAX(ra."createdAt")', 'createdAt')
        .groupBy('ra.id')
        .orderBy('MAX(ra."attendenceDate")', 'DESC')
        .addOrderBy('MAX(ra."createdAt")', 'DESC')
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawMany<{ id: string }>()
    ).map((row) => row.id);

    const checkIns = checkInIds.length
      ? await tenantDb.getRepository(RetailerAttendence).find({
          where: { id: In(checkInIds) },
          relations: [
            'retailer',
            'retailer.route',
            'retailer.route.area',
            'retailer.route.distributor',
          ],
        })
      : [];

    const checkInById = new Map(checkIns.map((checkIn) => [checkIn.id, checkIn]));
    const orderedCheckIns = checkInIds
      .map((id) => checkInById.get(id))
      .filter((checkIn): checkIn is RetailerAttendence => Boolean(checkIn));

    const salesmanMap = await this.fetchSalesmanMap(
      tenantDb,
      orderedCheckIns.map((checkIn) => checkIn.id),
    );

    const checkInRows = orderedCheckIns.map((checkIn) => ({
      id: checkIn.id,
      attendenceDate: checkIn.attendenceDate,
      checkInTime: checkIn.createdAt,
      checkinLatitude: checkIn.checkinLatitude
        ? Number(checkIn.checkinLatitude)
        : null,
      checkinLongitude: checkIn.checkinLongitude
        ? Number(checkIn.checkinLongitude)
        : null,
      retailer: {
        id: checkIn.retailer.id,
        shopName: checkIn.retailer.shopName,
        code: checkIn.retailer.id,
        address: checkIn.retailer.address,
      },
      route: {
        id: checkIn.retailer.route.id,
        name: checkIn.retailer.route.name,
      },
      area: {
        id: checkIn.retailer.route.area.id,
        name: checkIn.retailer.route.area.name,
      },
      distributor: {
        id: checkIn.retailer.route.distributor.id,
        name: checkIn.retailer.route.distributor.name,
      },
      salesman: salesmanMap.get(checkIn.id) ?? null,
    }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHECKIN_REPORT_VIEWED',
      description: 'Retailer check-in report viewed',
      metadata: {
        reportType,
        totalCheckIns: summary.totalCheckIns,
        page,
        limit,
      },
    });

    return {
      filters: {
        reportType,
        salesmanId: filters.salesmanId,
        routeId: filters.routeId,
        distributorId: filters.distributorId,
        areaId: filters.areaId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
      },
      summary,
      charts: {
        trend,
        byRoute,
        bySalesman,
        byDayOfWeek,
        byHour,
      },
      groups,
      checkIns: checkInRows,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }
}
