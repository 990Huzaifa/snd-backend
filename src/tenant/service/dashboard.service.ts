import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Attendence,
  AttendenceStatus,
} from 'src/tenant-db/entities/attendence.entity';
import { LoadSheetStatus } from 'src/tenant-db/entities/loadsheet.entity';
import {
  OrderStatus,
  SaleOrder,
} from 'src/tenant-db/entities/saleorder.entity';
import {
  MetricType,
  TargetMetricEntity,
  TargetPlanAssigneeStatus,
  TargetPlanEntity,
  TargetPlanStatus,
} from 'src/tenant-db/entities/target-plan.entity';
import { User, UserType } from 'src/tenant-db/entities/user.entity';
import {
  DashboardAttendanceQueryDto,
  DashboardOrdersQueryDto,
  DashboardOverviewQueryDto,
  DashboardSalesQueryDto,
  DashboardTargetAchievementGroupBy,
  DashboardTargetAchievementQueryDto,
} from '../dto/dashboard/dashboard.dto';
import { MasterGeoHelperService } from './master-geo-helper.service';

/** Approved/executed sale orders (same set used by target plans). */
const APPROVED_SALE_ORDER_STATUSES = [
  OrderStatus.APPROVED,
  OrderStatus.PROCESSING,
  OrderStatus.DELIVERED,
] as const;

const ATTENDANCE_ROLE_TYPES = [
  UserType.SALESMAN,
  UserType.MERCHANDISER,
  UserType.RIDER,
  UserType.SPG,
] as const;

const ATTENDANCE_ROLE_LABELS: Record<
  (typeof ATTENDANCE_ROLE_TYPES)[number],
  string
> = {
  [UserType.SALESMAN]: 'Salesman',
  [UserType.MERCHANDISER]: 'Merchandiser',
  [UserType.RIDER]: 'Rider',
  [UserType.SPG]: 'SPG',
};

const PRESENT_LIKE_STATUSES = [
  AttendenceStatus.PRESENT,
  AttendenceStatus.WORK_FROM_HOME,
  AttendenceStatus.REMOTE,
] as const;

/** Check-in after this local time counts as late (hour, minute). */
const LATE_ARRIVAL_THRESHOLD = { hour: 9, minute: 30 } as const;

type SalesPeriod = 'MTD' | 'YTD';
type DateRange = { start: Date; end: Date };

type AchievementGroupKey = {
  key: string;
  label: string;
  cityId: string | null;
  areaId: string | null;
};

type AchievementPlanMeta = {
  planId: string;
  cityId: string;
  status: TargetPlanStatus;
  target: number;
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly masterGeoHelperService: MasterGeoHelperService) {}

  // ---------------------------------------------------------------------------
  // Public card endpoints
  // ---------------------------------------------------------------------------

  async getMtdSales(
    tenantDb: DataSource,
    query: DashboardSalesQueryDto,
    _user: { userId: string },
  ) {
    try {
      return await this.getSalesCard(tenantDb, query, 'MTD');
    } catch (error) {
      this.logger.error(
        `getMtdSales failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async getYtdSales(
    tenantDb: DataSource,
    query: DashboardSalesQueryDto,
    _user: { userId: string },
  ) {
    try {
      return await this.getSalesCard(tenantDb, query, 'YTD');
    } catch (error) {
      this.logger.error(
        `getYtdSales failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async getOrdersFulfillment(
    tenantDb: DataSource,
    query: DashboardOrdersQueryDto,
    _user: { userId: string },
  ) {
    try {
      return await this.buildOrdersFulfillment(tenantDb, query);
    } catch (error) {
      this.logger.error(
        `getOrdersFulfillment failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async buildOrdersFulfillment(
    tenantDb: DataSource,
    query: DashboardOrdersQueryDto,
  ) {
    const anchor = this.resolveAnchorDate(query.date);
    const dayRange = this.getDayRange(anchor);
    const previousWeekAnchor = new Date(anchor);
    previousWeekAnchor.setDate(previousWeekAnchor.getDate() - 7);
    const previousWeekRange = this.getDayRange(previousWeekAnchor);
    const distributorId = this.normalizeOptionalId(query.distributorId);

    const [current, previous] = await Promise.all([
      this.getOrderFulfillmentCounts(tenantDb, dayRange, distributorId),
      this.getOrderFulfillmentCounts(tenantDb, previousWeekRange, distributorId),
    ]);

    const total = current.executed + current.pending + current.unassigned;
    const executedPercent = this.percentOf(current.executed, total);
    const pendingPercent = this.percentOf(current.pending, total);
    const unassignedPercent = this.percentOf(current.unassigned, total);

    const growthPercent = this.growthPercent(
      current.executed,
      previous.executed,
    );

    return {
      filters: {
        date: this.toDateString(anchor),
        distributorId,
        granularity: 'DAY_WISE',
      },
      summary: {
        total,
        executed: current.executed,
        pending: current.pending,
        unassigned: current.unassigned,
        executedPercent,
        pendingPercent,
        unassignedPercent,
        growthPercent,
        comparisonLabel: 'vs last week',
      },
      segments: [
        { key: 'EXECUTED', label: 'Executed', count: current.executed, percent: executedPercent },
        { key: 'UNASSIGNED', label: 'Unassigned', count: current.unassigned, percent: unassignedPercent },
        { key: 'PENDING', label: 'Pending', count: current.pending, percent: pendingPercent },
      ],
    };
  }

  async getAttendanceLive(
    tenantDb: DataSource,
    query: DashboardAttendanceQueryDto,
    _user: { userId: string },
  ) {
    const anchor = this.resolveAnchorDate(query.date);
    const dayRange = this.getDayRange(anchor);
    const distributorId = this.normalizeOptionalId(query.distributorId);

    const usersQb = tenantDb
      .getRepository(User)
      .createQueryBuilder('u')
      .select(['u.id', 'u.type'])
      .where('u."isActive" = true')
      .andWhere('u."isDeleted" = false')
      .andWhere('u.type IN (:...types)', { types: [...ATTENDANCE_ROLE_TYPES] });

    if (distributorId) {
      usersQb.andWhere(
        `EXISTS (
          SELECT 1 FROM salesman_distributors sd
          WHERE sd."userId" = u.id AND sd."distributorId" = :distributorId
        )`,
        { distributorId },
      );
    }

    const users = await usersQb.getMany();
    const userIds = users.map((u) => u.id);

    const attendanceByUser = new Map<string, Attendence>();
    if (userIds.length) {
      const attendanceQb = tenantDb
        .getRepository(Attendence)
        .createQueryBuilder('a')
        .where('a.userId IN (:...userIds)', { userIds })
        .andWhere('a.attendenceDate >= :start', { start: dayRange.start })
        .andWhere('a.attendenceDate < :end', { end: dayRange.end });

      if (distributorId) {
        attendanceQb.andWhere('a.distributorId = :distributorId', {
          distributorId,
        });
      }

      const records = await attendanceQb
        .orderBy('a.checkInTime', 'ASC')
        .getMany();

      for (const record of records) {
        if (!attendanceByUser.has(record.userId)) {
          attendanceByUser.set(record.userId, record);
        }
      }
    }

    let present = 0;
    let absent = 0;
    let late = 0;
    let onLeave = 0;

    const roleStats = new Map<
      (typeof ATTENDANCE_ROLE_TYPES)[number],
      { present: number; expected: number }
    >();
    for (const type of ATTENDANCE_ROLE_TYPES) {
      roleStats.set(type, { present: 0, expected: 0 });
    }

    for (const user of users) {
      if (!ATTENDANCE_ROLE_TYPES.includes(user.type as (typeof ATTENDANCE_ROLE_TYPES)[number])) {
        continue;
      }
      const roleType = user.type as (typeof ATTENDANCE_ROLE_TYPES)[number];
      const role = roleStats.get(roleType)!;
      role.expected += 1;

      const record = attendanceByUser.get(user.id);
      if (!record) {
        absent += 1;
        continue;
      }

      if (record.status === AttendenceStatus.LEAVE) {
        onLeave += 1;
        continue;
      }

      if (this.isPresentLike(record.status)) {
        present += 1;
        role.present += 1;
        if (this.isLateArrival(record)) {
          late += 1;
        }
        continue;
      }

      absent += 1;
    }

    const expected = users.length;
    const attendanceRate = this.percentOf(present, expected);

    return {
      filters: {
        date: this.toDateString(anchor),
        distributorId,
        live: this.isSameCalendarDay(anchor, new Date()),
      },
      summary: {
        attendanceRate,
        present,
        expected,
        absent,
        late,
        onLeave,
        presentOfExpected: `${present}/${expected}`,
      },
      byRole: ATTENDANCE_ROLE_TYPES.map((type) => {
        const stats = roleStats.get(type)!;
        return {
          userType: type,
          label: ATTENDANCE_ROLE_LABELS[type],
          present: stats.present,
          expected: stats.expected,
          rate: this.percentOf(stats.present, stats.expected),
          presentOfExpected: `${stats.present}/${stats.expected}`,
        };
      }),
    };
  }

  async getOverview(
    tenantDb: DataSource,
    query: DashboardOverviewQueryDto,
    user: { userId: string },
  ) {
    const shared = {
      distributorId: query.distributorId,
      date: query.date,
    };

    const [mtdSales, ytdSales, orders, attendance] = await Promise.all([
      this.getMtdSales(tenantDb, shared, user),
      this.getYtdSales(tenantDb, shared, user),
      this.getOrdersFulfillment(tenantDb, shared, user),
      this.getAttendanceLive(tenantDb, shared, user),
    ]);

    return { mtdSales, ytdSales, orders, attendance };
  }

  async getTargetAchievement(
    tenantDb: DataSource,
    query: DashboardTargetAchievementQueryDto,
    _user: { userId: string },
  ) {
    try {
      return await this.buildTargetAchievement(tenantDb, query);
    } catch (error) {
      this.logger.error(
        `getTargetAchievement failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async buildTargetAchievement(
    tenantDb: DataSource,
    query: DashboardTargetAchievementQueryDto,
  ) {
    const range = this.resolveDateRange(query.dateFrom, query.dateTo);
    const distributorId = this.normalizeOptionalId(query.distributorId);
    const categoryId = this.normalizeOptionalId(query.categoryId);
    const groupBy = query.groupBy ?? DashboardTargetAchievementGroupBy.CITY;

    const [achievedByGroup, trendByGroup, planMetaByCity, areaTargets] =
      await Promise.all([
        this.sumAchievementSalesByGroup(
          tenantDb,
          range,
          groupBy,
          distributorId,
          categoryId,
        ),
        this.sumAchievementTrendByGroup(
          tenantDb,
          range,
          groupBy,
          distributorId,
          categoryId,
        ),
        this.loadCityPlanTargets(tenantDb, range),
        groupBy === DashboardTargetAchievementGroupBy.AREA
          ? this.loadAreaTargetsFromAssignees(
              tenantDb,
              range,
              distributorId,
            )
          : Promise.resolve(new Map<string, number>()),
      ]);

    const groups = await this.buildAchievementGroups(
      tenantDb,
      groupBy,
      range,
      achievedByGroup,
      trendByGroup,
      planMetaByCity,
      areaTargets,
      distributorId,
    );

    const totalAchieved = groups.reduce((sum, row) => sum + row.achieved, 0);
    const totalTarget = groups.reduce((sum, row) => sum + row.target, 0);
    const remaining = Math.max(totalTarget - totalAchieved, 0);
    const achievementPercent = this.percentOf(totalAchieved, totalTarget);

    const today = this.startOfDay(new Date());
    const elapsedEnd =
      today < range.end ? today : this.startOfDay(range.end);
    const elapsedDays = Math.max(
      1,
      Math.floor(
        (elapsedEnd.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1,
    );
    const totalDays = Math.max(
      1,
      Math.floor(
        (range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1,
    );
    const remainingDays = Math.max(totalDays - elapsedDays, 0);
    const dailyRequiredAvg =
      remainingDays > 0 ? Math.round((remaining / remainingDays) * 100) / 100 : 0;
    const projectedAchievement =
      (totalAchieved / elapsedDays) * totalDays;
    const projectionPercent = this.percentOf(projectedAchievement, totalTarget);

    const legend = { onTrack: 0, atRisk: 0, behind: 0 };
    const rows = groups
      .map((row) => {
      const progressPercent = this.percentOf(row.achieved, row.target);
      const displayStatus = this.resolveAchievementStatus(
        row.planStatus,
        progressPercent,
      );
      const health = this.resolveAchievementHealth(progressPercent);
      legend[health] += 1;

      return {
        key: row.key,
        label: row.label,
        cityId: row.cityId,
        areaId: row.areaId,
        planId: row.planId,
        status: displayStatus,
        achieved: row.achieved,
        target: row.target,
        progressPercent,
        remaining: Math.max(row.target - row.achieved, 0),
        trendSeries: row.trendSeries,
        health,
      };
    })
      .sort((a, b) => b.achieved - a.achieved || a.label.localeCompare(b.label));

    return {
      filters: {
        distributorId,
        categoryId,
        dateFrom: this.toDateString(range.start),
        dateTo: this.toDateString(range.end),
        groupBy,
        orderStatuses: [...APPROVED_SALE_ORDER_STATUSES],
      },
      summary: {
        achievementPercent,
        achieved: totalAchieved,
        target: totalTarget,
        remaining,
        dailyRequiredAvg,
        projectionPercent,
        elapsedDays,
        totalDays,
        remainingDays,
      },
      legend,
      groups: rows,
    };
  }

  private async buildAchievementGroups(
    tenantDb: DataSource,
    groupBy: DashboardTargetAchievementGroupBy,
    range: DateRange,
    achievedByGroup: Map<string, number>,
    trendByGroup: Map<string, Array<{ date: string; value: number }>>,
    planMetaByCity: Map<string, AchievementPlanMeta>,
    areaTargets: Map<string, number>,
    distributorId: string | null,
  ) {
    const groupKeys = await this.loadAchievementGroupKeys(
      tenantDb,
      groupBy,
      distributorId,
      achievedByGroup,
      planMetaByCity,
      areaTargets,
    );
    const zeroTrend = this.buildZeroTrendSeries(range);

    return groupKeys.map((group) => {
      const achieved = achievedByGroup.get(group.key) ?? 0;
      const planMeta =
        group.cityId != null ? planMetaByCity.get(group.cityId) : undefined;
      const target =
        groupBy === DashboardTargetAchievementGroupBy.AREA
          ? areaTargets.get(group.key) ?? 0
          : planMeta?.target ?? 0;

      return {
        key: group.key,
        label: group.label,
        cityId: group.cityId,
        areaId: group.areaId,
        planId: planMeta?.planId ?? null,
        planStatus: planMeta?.status ?? null,
        achieved,
        target,
        trendSeries: trendByGroup.get(group.key) ?? zeroTrend,
      };
    });
  }

  private async loadAchievementGroupKeys(
    tenantDb: DataSource,
    groupBy: DashboardTargetAchievementGroupBy,
    distributorId: string | null,
    achievedByGroup: Map<string, number>,
    planMetaByCity: Map<string, AchievementPlanMeta>,
    areaTargets: Map<string, number>,
  ): Promise<AchievementGroupKey[]> {
    const keys = new Set<string>([
      ...achievedByGroup.keys(),
      ...planMetaByCity.keys(),
      ...areaTargets.keys(),
    ]);

    if (groupBy === DashboardTargetAchievementGroupBy.CITY) {
      const hierarchyCityIds = await this.loadCityIdsFromHierarchy(
        tenantDb,
        distributorId,
      );
      for (const cityId of hierarchyCityIds) {
        keys.add(cityId);
      }

      const cityNames = await Promise.all(
        [...keys].map(async (cityId) => ({
          cityId,
          name:
            (await this.masterGeoHelperService.getCityNameById(cityId)) ??
            cityId,
        })),
      );
      const nameByCityId = new Map(
        cityNames.map((row) => [row.cityId, row.name]),
      );

      return [...keys].map((cityId) => ({
        key: cityId,
        label: nameByCityId.get(cityId) ?? cityId,
        cityId,
        areaId: null,
      }));
    }

    const hierarchyAreas = await this.loadAreasFromHierarchy(
      tenantDb,
      distributorId,
    );
    for (const area of hierarchyAreas) {
      keys.add(area.key);
    }

    if (!keys.size) {
      return [];
    }

    const areaIds = [...keys].map((id) => `'${id}'`).join(', ');
    let sql = `
      SELECT a.id AS key, a.name AS label, region."cityId" AS "cityId"
      FROM areas a
      INNER JOIN regions region ON region.id = a."regionId"
      WHERE a.id IN (${areaIds})
    `;

    const params: unknown[] = [];
    if (distributorId) {
      params.push(distributorId);
      sql += `
        AND EXISTS (
          SELECT 1 FROM routes r
          WHERE r."areaId" = a.id AND r."distributorId" = $1
        )
      `;
    }

    const rows = (await tenantDb.query(sql, params)) as Array<{
      key: string;
      label: string;
      cityId: string;
    }>;

    const mapped = new Map(
      rows.map((row) => [
        row.key,
        {
          key: row.key,
          label: row.label,
          cityId: row.cityId,
          areaId: row.key,
        },
      ]),
    );

    for (const area of hierarchyAreas) {
      if (!mapped.has(area.key)) {
        mapped.set(area.key, area);
      }
    }

    return [...keys].map((key) => {
      const existing = mapped.get(key);
      if (existing) {
        return existing;
      }
      return {
        key,
        label: key,
        cityId: null,
        areaId: key,
      };
    });
  }

  private async loadCityIdsFromHierarchy(
    tenantDb: DataSource,
    distributorId: string | null,
  ): Promise<string[]> {
    const params: unknown[] = [];
    let sql = `
      SELECT DISTINCT region."cityId" AS "cityId"
      FROM routes r
      INNER JOIN areas a ON a.id = r."areaId"
      INNER JOIN regions region ON region.id = a."regionId"
      WHERE region."isActive" = true
    `;

    if (distributorId) {
      params.push(distributorId);
      sql += ` AND r."distributorId" = $1`;
    }

    const rows = (await tenantDb.query(sql, params)) as Array<{ cityId: string }>;
    return rows.map((row) => row.cityId);
  }

  private async loadAreasFromHierarchy(
    tenantDb: DataSource,
    distributorId: string | null,
  ): Promise<AchievementGroupKey[]> {
    const params: unknown[] = [];
    let sql = `
      SELECT DISTINCT a.id AS key, a.name AS label, region."cityId" AS "cityId"
      FROM routes r
      INNER JOIN areas a ON a.id = r."areaId"
      INNER JOIN regions region ON region.id = a."regionId"
      WHERE region."isActive" = true
    `;

    if (distributorId) {
      params.push(distributorId);
      sql += ` AND r."distributorId" = $1`;
    }

    const rows = (await tenantDb.query(sql, params)) as Array<{
      key: string;
      label: string;
      cityId: string;
    }>;

    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      cityId: row.cityId,
      areaId: row.key,
    }));
  }

  private async sumAchievementSalesByGroup(
    tenantDb: DataSource,
    range: DateRange,
    groupBy: DashboardTargetAchievementGroupBy,
    distributorId: string | null,
    categoryId: string | null,
  ): Promise<Map<string, number>> {
    const statusList = APPROVED_SALE_ORDER_STATUSES.map((s) => `'${s}'`).join(
      ', ',
    );
    const groupExpr =
      groupBy === DashboardTargetAchievementGroupBy.CITY
        ? `region."cityId"`
        : `a.id::text`;

    const params: unknown[] = [range.start, this.endOfDay(range.end)];
    let paramIndex = 3;

    let sql = `
      SELECT ${groupExpr} AS key,
             COALESCE(SUM(so."totalAmount"), 0) AS achieved
      FROM sale_orders so
      INNER JOIN routes r ON r.id = so."routeId"
      INNER JOIN areas a ON a.id = r."areaId"
      INNER JOIN regions region ON region.id = a."regionId"
      WHERE so."orderStatus" IN (${statusList})
        AND so."orderDate" >= $1
        AND so."orderDate" <= $2
    `;

    if (distributorId) {
      sql += ` AND r."distributorId" = $${paramIndex}`;
      params.push(distributorId);
      paramIndex += 1;
    }

    if (categoryId) {
      sql += `
        AND EXISTS (
          SELECT 1
          FROM sale_order_items soi
          INNER JOIN products p ON p.id = soi."productId"
          WHERE soi."saleOrderId" = so.id
            AND p."categoryId" = $${paramIndex}
        )
      `;
      params.push(categoryId);
      paramIndex += 1;
    }

    sql += ` GROUP BY ${groupExpr}`;

    const rows = (await tenantDb.query(sql, params)) as Array<{
      key: string;
      achieved: string | number;
    }>;

    return new Map(rows.map((row) => [String(row.key), this.toNumber(row.achieved)]));
  }

  private async sumAchievementTrendByGroup(
    tenantDb: DataSource,
    range: DateRange,
    groupBy: DashboardTargetAchievementGroupBy,
    distributorId: string | null,
    categoryId: string | null,
  ): Promise<Map<string, Array<{ date: string; value: number }>>> {
    const statusList = APPROVED_SALE_ORDER_STATUSES.map((s) => `'${s}'`).join(
      ', ',
    );
    const groupExpr =
      groupBy === DashboardTargetAchievementGroupBy.CITY
        ? `region."cityId"`
        : `a.id::text`;

    const params: unknown[] = [range.start, this.endOfDay(range.end)];
    let paramIndex = 3;

    let sql = `
      SELECT ${groupExpr} AS key,
             TO_CHAR(so."orderDate", 'YYYY-MM-DD') AS bucket,
             COALESCE(SUM(so."totalAmount"), 0) AS value
      FROM sale_orders so
      INNER JOIN routes r ON r.id = so."routeId"
      INNER JOIN areas a ON a.id = r."areaId"
      INNER JOIN regions region ON region.id = a."regionId"
      WHERE so."orderStatus" IN (${statusList})
        AND so."orderDate" >= $1
        AND so."orderDate" <= $2
    `;

    if (distributorId) {
      sql += ` AND r."distributorId" = $${paramIndex}`;
      params.push(distributorId);
      paramIndex += 1;
    }

    if (categoryId) {
      sql += `
        AND EXISTS (
          SELECT 1
          FROM sale_order_items soi
          INNER JOIN products p ON p.id = soi."productId"
          WHERE soi."saleOrderId" = so.id
            AND p."categoryId" = $${paramIndex}
        )
      `;
      params.push(categoryId);
      paramIndex += 1;
    }

    sql += ` GROUP BY 1, 2 ORDER BY 1, 2`;

    const rows = (await tenantDb.query(sql, params)) as Array<{
      key: string;
      bucket: string;
      value: string | number;
    }>;

    const dateKeys = this.buildDateKeys(range);
    const byGroup = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const key = String(row.key);
      if (!byGroup.has(key)) {
        byGroup.set(key, new Map());
      }
      byGroup.get(key)!.set(row.bucket, this.toNumber(row.value));
    }

    const result = new Map<string, Array<{ date: string; value: number }>>();
    for (const [key, values] of byGroup.entries()) {
      result.set(
        key,
        dateKeys.map((date) => ({
          date,
          value: values.get(date) ?? 0,
        })),
      );
    }

    return result;
  }

  private async loadCityPlanTargets(
    tenantDb: DataSource,
    range: DateRange,
  ): Promise<Map<string, AchievementPlanMeta>> {
    const rows = await tenantDb
      .getRepository(TargetPlanEntity)
      .createQueryBuilder('plan')
      .innerJoin(
        TargetMetricEntity,
        'metric',
        'metric.targetPlanId = plan.id AND metric.metricType = :metricType',
        { metricType: MetricType.SALES_VALUE },
      )
      .select('plan.id', 'planId')
      .addSelect('plan.cityId', 'cityId')
      .addSelect('plan.status', 'status')
      .addSelect('plan.endDate', 'endDate')
      .addSelect('COALESCE(SUM(CAST(metric.targetValue AS DECIMAL)), 0)', 'target')
      .where('plan.status IN (:...statuses)', {
        statuses: [TargetPlanStatus.PUBLISHED, TargetPlanStatus.LOCKED],
      })
      .andWhere('plan.startDate <= :rangeEnd', {
        rangeEnd: this.endOfDay(range.end),
      })
      .andWhere('plan.endDate >= :rangeStart', { rangeStart: range.start })
      .groupBy('plan.id')
      .addGroupBy('plan.cityId')
      .addGroupBy('plan.status')
      .addGroupBy('plan.endDate')
      .orderBy('plan.endDate', 'DESC')
      .getRawMany<{
        planId: string;
        cityId: string;
        status: TargetPlanStatus;
        target: string;
      }>();

    const byCity = new Map<string, AchievementPlanMeta>();
    for (const row of rows) {
      if (!byCity.has(row.cityId)) {
        byCity.set(row.cityId, {
          planId: row.planId,
          cityId: row.cityId,
          status: row.status,
          target: this.toNumber(row.target),
        });
      }
    }
    return byCity;
  }

  private async loadAreaTargetsFromAssignees(
    tenantDb: DataSource,
    range: DateRange,
    distributorId: string | null,
  ): Promise<Map<string, number>> {
    const plans = await tenantDb
      .getRepository(TargetPlanEntity)
      .createQueryBuilder('plan')
      .innerJoinAndSelect(
        'plan.metrics',
        'metric',
        'metric.metricType = :metricType',
        { metricType: MetricType.SALES_VALUE },
      )
      .innerJoinAndSelect(
        'plan.assignees',
        'assignee',
        'assignee.status = :activeStatus',
        { activeStatus: TargetPlanAssigneeStatus.ACTIVE },
      )
      .where('plan.status IN (:...statuses)', {
        statuses: [TargetPlanStatus.PUBLISHED, TargetPlanStatus.LOCKED],
      })
      .andWhere('plan.startDate <= :rangeEnd', {
        rangeEnd: this.endOfDay(range.end),
      })
      .andWhere('plan.endDate >= :rangeStart', { rangeStart: range.start })
      .getMany();

    if (!plans.length) {
      return new Map();
    }

    const assigneeAreas = await this.loadAssigneeAreaMap(
      tenantDb,
      range,
      distributorId,
    );
    const areaTargets = new Map<string, number>();

    for (const plan of plans) {
      const activeAssignees = (plan.assignees ?? []).filter(
        (row) => row.status === TargetPlanAssigneeStatus.ACTIVE,
      );
      const salesMetric = (plan.metrics ?? []).find(
        (metric) => metric.metricType === MetricType.SALES_VALUE,
      );
      if (!activeAssignees.length || !salesMetric) {
        continue;
      }

      const planTarget = this.toNumber(salesMetric.targetValue);
      const sharePerAssignee = planTarget / activeAssignees.length;

      for (const assignee of activeAssignees) {
        const areas = assigneeAreas.get(assignee.assigneeId) ?? [];
        if (!areas.length) {
          continue;
        }
        const sharePerArea = sharePerAssignee / areas.length;
        for (const areaId of areas) {
          areaTargets.set(
            areaId,
            (areaTargets.get(areaId) ?? 0) + sharePerArea,
          );
        }
      }
    }

    return areaTargets;
  }

  private async loadAssigneeAreaMap(
    tenantDb: DataSource,
    range: DateRange,
    distributorId: string | null,
  ): Promise<Map<string, string[]>> {
    const statusList = APPROVED_SALE_ORDER_STATUSES.map((s) => `'${s}'`).join(
      ', ',
    );
    const params: unknown[] = [range.start, this.endOfDay(range.end)];
    let sql = `
      SELECT DISTINCT so."salesmanId" AS "assigneeId", r."areaId" AS "areaId"
      FROM sale_orders so
      INNER JOIN routes r ON r.id = so."routeId"
      WHERE so."orderStatus" IN (${statusList})
        AND so."orderDate" >= $1
        AND so."orderDate" <= $2
    `;

    if (distributorId) {
      params.push(distributorId);
      sql += ` AND r."distributorId" = $3`;
    }

    const rows = (await tenantDb.query(sql, params)) as Array<{
      assigneeId: string;
      areaId: string;
    }>;

    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!map.has(row.assigneeId)) {
        map.set(row.assigneeId, new Set());
      }
      map.get(row.assigneeId)!.add(row.areaId);
    }

    return new Map(
      [...map.entries()].map(([assigneeId, areas]) => [
        assigneeId,
        [...areas],
      ]),
    );
  }

  private resolveAchievementStatus(
    planStatus: TargetPlanStatus | null,
    progressPercent: number,
  ): TargetPlanStatus | 'BUFFER' {
    if (progressPercent >= 100) {
      return 'BUFFER';
    }
    return planStatus ?? TargetPlanStatus.PUBLISHED;
  }

  private resolveAchievementHealth(
    progressPercent: number,
  ): 'onTrack' | 'atRisk' | 'behind' {
    if (progressPercent >= 80) {
      return 'onTrack';
    }
    if (progressPercent >= 50) {
      return 'atRisk';
    }
    return 'behind';
  }

  private resolveDateRange(dateFrom: string, dateTo: string): DateRange {
    const start = this.resolveAnchorDate(dateFrom);
    const end = this.resolveAnchorDate(dateTo);
    if (start > end) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }
    return { start, end };
  }

  private buildDateKeys(range: DateRange): string[] {
    const keys: string[] = [];
    const cursor = new Date(range.start);
    const last = this.startOfDay(range.end);
    while (cursor <= last) {
      keys.push(this.toDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  }

  private buildZeroTrendSeries(
    range: DateRange,
  ): Array<{ date: string; value: number }> {
    return this.buildDateKeys(range).map((date) => ({ date, value: 0 }));
  }

  // ---------------------------------------------------------------------------
  // Sales card helpers
  // ---------------------------------------------------------------------------

  private async getSalesCard(
    tenantDb: DataSource,
    query: DashboardSalesQueryDto,
    period: SalesPeriod,
  ) {
    const anchor = this.resolveAnchorDate(query.date);
    const distributorId = this.normalizeOptionalId(query.distributorId);
    const currentRange =
      period === 'MTD'
        ? this.getMonthToDateRange(anchor)
        : this.getYearToDateRange(anchor);
    const previousRange =
      period === 'MTD'
        ? this.getPreviousMonthToDateRange(anchor)
        : this.getPreviousYearToDateRange(anchor);

    const [netSales, previousNetSales, target, trendSeries] = await Promise.all([
      this.sumApprovedSales(tenantDb, currentRange, distributorId).catch(
        (error) => {
          this.logger.error(
            `sumApprovedSales(current) failed: ${
              error instanceof Error ? error.message : error
            }`,
          );
          return 0;
        },
      ),
      this.sumApprovedSales(tenantDb, previousRange, distributorId).catch(
        (error) => {
          this.logger.error(
            `sumApprovedSales(previous) failed: ${
              error instanceof Error ? error.message : error
            }`,
          );
          return 0;
        },
      ),
      this.getSalesTarget(tenantDb, currentRange),
      period === 'MTD'
        ? this.getDailySalesTrend(tenantDb, currentRange, distributorId)
        : this.getMonthlySalesTrend(tenantDb, currentRange, distributorId),
    ]);

    return {
      filters: {
        period,
        date: this.toDateString(anchor),
        dateFrom: this.toDateString(currentRange.start),
        dateTo: this.toDateString(currentRange.end),
        distributorId,
        orderStatuses: [...APPROVED_SALE_ORDER_STATUSES],
      },
      summary: {
        netSales,
        target,
        growthPercent: this.growthPercent(netSales, previousNetSales),
        achievementPercent: this.percentOf(netSales, target),
        comparisonLabel: period === 'MTD' ? 'vs last month' : 'vs last year',
      },
      trendSeries,
    };
  }

  /** Sum totalAmount for approved/executed sale orders in range. */
  private async sumApprovedSales(
    tenantDb: DataSource,
    range: DateRange,
    distributorId: string | null,
  ): Promise<number> {
    const statusList = APPROVED_SALE_ORDER_STATUSES.map((s) => `'${s}'`).join(
      ', ',
    );
    const params: unknown[] = [range.start, this.endOfDay(range.end)];

    let sql = `
      SELECT COALESCE(SUM(so."totalAmount"), 0) AS total
      FROM sale_orders so
      WHERE so."orderStatus" IN (${statusList})
        AND so."orderDate" >= $1
        AND so."orderDate" <= $2
    `;

    if (distributorId) {
      params.push(distributorId);
      sql += ` AND so."distributorId" = $3`;
    }

    const rows = (await tenantDb.query(sql, params)) as Array<{
      total: string | number;
    }>;
    return this.toNumber(rows[0]?.total);
  }

  private async getSalesTarget(
    tenantDb: DataSource,
    range: DateRange,
  ): Promise<number> {
    try {
      const row = await tenantDb
        .getRepository(TargetMetricEntity)
        .createQueryBuilder('metric')
        .innerJoin('metric.targetPlan', 'plan')
        .select('COALESCE(SUM(CAST(metric.targetValue AS DECIMAL)), 0)', 'total')
        .where('metric.metricType = :metricType', {
          metricType: MetricType.SALES_VALUE,
        })
        .andWhere('plan.status IN (:...statuses)', {
          statuses: [TargetPlanStatus.PUBLISHED, TargetPlanStatus.LOCKED],
        })
        .andWhere('plan.startDate <= :rangeEnd', {
          rangeEnd: this.endOfDay(range.end),
        })
        .andWhere('plan.endDate >= :rangeStart', { rangeStart: range.start })
        .getRawOne<{ total: string }>();

      return this.toNumber(row?.total);
    } catch (error) {
      this.logger.warn(
        `Sales target query failed; returning 0. ${
          error instanceof Error ? error.message : error
        }`,
      );
      return 0;
    }
  }

  private async getDailySalesTrend(
    tenantDb: DataSource,
    range: DateRange,
    distributorId: string | null,
  ): Promise<Array<{ date: string; value: number }>> {
    const byDate = new Map<string, number>();

    try {
      const statusList = APPROVED_SALE_ORDER_STATUSES.map((s) => `'${s}'`).join(
        ', ',
      );
      const params: unknown[] = [range.start, this.endOfDay(range.end)];

      let sql = `
        SELECT TO_CHAR(so."orderDate", 'YYYY-MM-DD') AS bucket,
               COALESCE(SUM(so."totalAmount"), 0) AS value
        FROM sale_orders so
        WHERE so."orderStatus" IN (${statusList})
          AND so."orderDate" >= $1
          AND so."orderDate" <= $2
      `;

      if (distributorId) {
        params.push(distributorId);
        sql += ` AND so."distributorId" = $3`;
      }

      sql += ` GROUP BY 1 ORDER BY 1`;

      const rows = (await tenantDb.query(sql, params)) as Array<{
        bucket: string;
        value: string | number;
      }>;

      for (const row of rows) {
        byDate.set(row.bucket, this.toNumber(row.value));
      }
    } catch (error) {
      this.logger.warn(
        `Daily sales trend failed; returning zero-filled series. ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    const series: Array<{ date: string; value: number }> = [];
    const cursor = new Date(range.start);
    const last = this.startOfDay(range.end);
    while (cursor <= last) {
      const key = this.toDateString(cursor);
      series.push({ date: key, value: byDate.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return series;
  }

  private async getMonthlySalesTrend(
    tenantDb: DataSource,
    range: DateRange,
    distributorId: string | null,
  ): Promise<Array<{ date: string; value: number }>> {
    const byMonth = new Map<string, number>();

    try {
      const statusList = APPROVED_SALE_ORDER_STATUSES.map((s) => `'${s}'`).join(
        ', ',
      );
      const params: unknown[] = [range.start, this.endOfDay(range.end)];

      let sql = `
        SELECT TO_CHAR(DATE_TRUNC('month', so."orderDate"), 'YYYY-MM') AS bucket,
               COALESCE(SUM(so."totalAmount"), 0) AS value
        FROM sale_orders so
        WHERE so."orderStatus" IN (${statusList})
          AND so."orderDate" >= $1
          AND so."orderDate" <= $2
      `;

      if (distributorId) {
        params.push(distributorId);
        sql += ` AND so."distributorId" = $3`;
      }

      sql += ` GROUP BY 1 ORDER BY 1`;

      const rows = (await tenantDb.query(sql, params)) as Array<{
        bucket: string;
        value: string | number;
      }>;

      for (const row of rows) {
        byMonth.set(String(row.bucket), this.toNumber(row.value));
      }
    } catch (error) {
      this.logger.warn(
        `Monthly sales trend failed; returning zero-filled series. ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    const series: Array<{ date: string; value: number }> = [];
    const cursor = new Date(
      range.start.getFullYear(),
      range.start.getMonth(),
      1,
    );
    const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    while (cursor <= last) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      series.push({ date: key, value: byMonth.get(key) ?? 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return series;
  }

  // ---------------------------------------------------------------------------
  // Orders helpers
  // ---------------------------------------------------------------------------

  private async getOrderFulfillmentCounts(
    tenantDb: DataSource,
    range: { start: Date; end: Date },
    distributorId: string | null,
  ): Promise<{ executed: number; pending: number; unassigned: number }> {
    // Exclusive buckets that always sum to total:
    // - Executed: DELIVERED, or APPROVED/PROCESSING already on a load sheet
    // - Pending: PENDING
    // - Unassigned: APPROVED/PROCESSING with no active load sheet
    const baseQb = () => {
      const qb = tenantDb
        .getRepository(SaleOrder)
        .createQueryBuilder('saleOrder')
        .where('saleOrder.orderDate >= :start', { start: range.start })
        .andWhere('saleOrder.orderDate < :end', { end: range.end });

      if (distributorId) {
        qb.andWhere('saleOrder.distributorId = :distributorId', {
          distributorId,
        });
      }
      return qb;
    };

    const assignedOrderIdsSql = `
      SELECT lso."saleOrderId"
      FROM load_sheet_orders lso
      INNER JOIN load_sheets ls ON ls.id = lso."loadSheetId"
      WHERE ls.status != :cancelledLoadSheet
    `;

    const [delivered, pending, assignedInProgress, unassigned] =
      await Promise.all([
        baseQb()
          .andWhere('saleOrder.orderStatus = :status', {
            status: OrderStatus.DELIVERED,
          })
          .getCount(),
        baseQb()
          .andWhere('saleOrder.orderStatus = :status', {
            status: OrderStatus.PENDING,
          })
          .getCount(),
        baseQb()
          .andWhere('saleOrder.orderStatus IN (:...statuses)', {
            statuses: [OrderStatus.APPROVED, OrderStatus.PROCESSING],
          })
          .andWhere(`saleOrder.id IN (${assignedOrderIdsSql})`)
          .setParameter('cancelledLoadSheet', LoadSheetStatus.CANCELLED)
          .getCount(),
        baseQb()
          .andWhere('saleOrder.orderStatus IN (:...statuses)', {
            statuses: [OrderStatus.APPROVED, OrderStatus.PROCESSING],
          })
          .andWhere(`saleOrder.id NOT IN (${assignedOrderIdsSql})`)
          .setParameter('cancelledLoadSheet', LoadSheetStatus.CANCELLED)
          .getCount(),
      ]);

    return {
      executed: delivered + assignedInProgress,
      pending,
      unassigned,
    };
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private resolveAnchorDate(value?: string): Date {
    if (!value?.trim()) {
      return this.startOfDay(new Date());
    }
    const normalized = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
    if (!match) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = this.startOfDay(new Date(year, month - 1, day));
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return date;
  }

  private normalizeOptionalId(value?: string): string | null {
    const normalized = (value ?? '').trim();
    return normalized || null;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private getDayRange(reference: Date) {
    const start = this.startOfDay(reference);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private getMonthToDateRange(anchor: Date) {
    return {
      start: this.startOfDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
      end: this.startOfDay(anchor),
    };
  }

  private getPreviousMonthToDateRange(anchor: Date) {
    const day = anchor.getDate();
    const prevMonthLast = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
    const clampedDay = Math.min(day, prevMonthLast.getDate());
    return {
      start: this.startOfDay(
        new Date(prevMonthLast.getFullYear(), prevMonthLast.getMonth(), 1),
      ),
      end: this.startOfDay(
        new Date(
          prevMonthLast.getFullYear(),
          prevMonthLast.getMonth(),
          clampedDay,
        ),
      ),
    };
  }

  private getYearToDateRange(anchor: Date) {
    return {
      start: this.startOfDay(new Date(anchor.getFullYear(), 0, 1)),
      end: this.startOfDay(anchor),
    };
  }

  private getPreviousYearToDateRange(anchor: Date) {
    return {
      start: this.startOfDay(new Date(anchor.getFullYear() - 1, 0, 1)),
      end: this.startOfDay(
        new Date(anchor.getFullYear() - 1, anchor.getMonth(), anchor.getDate()),
      ),
    };
  }

  private toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private isSameCalendarDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private toNumber(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private percentOf(part: number, total: number): number {
    if (!total || total <= 0) {
      return 0;
    }
    return Math.round((part / total) * 1000) / 10;
  }

  private growthPercent(current: number, previous: number): number {
    if (!previous) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  private isPresentLike(status: AttendenceStatus): boolean {
    return (PRESENT_LIKE_STATUSES as readonly AttendenceStatus[]).includes(
      status,
    );
  }

  private isLateArrival(record: Attendence): boolean {
    if (!record.checkInTime || !this.isPresentLike(record.status)) {
      return false;
    }
    const checkIn = new Date(record.checkInTime);
    const thresholdMinutes =
      LATE_ARRIVAL_THRESHOLD.hour * 60 + LATE_ARRIVAL_THRESHOLD.minute;
    const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
    return checkInMinutes > thresholdMinutes;
  }
}
