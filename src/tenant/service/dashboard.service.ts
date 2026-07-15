import { BadRequestException, Injectable } from '@nestjs/common';
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
  ReturnStatus,
  SaleReturn,
} from 'src/tenant-db/entities/sale-return.entity';
import {
  MetricType,
  TargetMetricEntity,
  TargetPlanEntity,
  TargetPlanStatus,
} from 'src/tenant-db/entities/target-plan.entity';
import { User, UserType } from 'src/tenant-db/entities/user.entity';
import {
  DashboardAttendanceQueryDto,
  DashboardOrdersQueryDto,
  DashboardOverviewQueryDto,
  DashboardSalesQueryDto,
} from '../dto/dashboard/dashboard.dto';

const COUNTABLE_SALE_ORDER_STATUSES = [
  OrderStatus.APPROVED,
  OrderStatus.PROCESSING,
  OrderStatus.DELIVERED,
] as const;

const FULFILLMENT_ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.APPROVED,
  OrderStatus.PROCESSING,
  OrderStatus.DELIVERED,
] as const;

const APPROVED_RETURN_STATUSES = [
  ReturnStatus.APPROVED,
  ReturnStatus.COMPLETED,
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

@Injectable()
export class DashboardService {
  // ---------------------------------------------------------------------------
  // Public card endpoints
  // ---------------------------------------------------------------------------

  async getMtdSales(
    tenantDb: DataSource,
    query: DashboardSalesQueryDto,
    _user: { userId: string },
  ) {
    return this.getSalesCard(tenantDb, query, 'MTD');
  }

  async getYtdSales(
    tenantDb: DataSource,
    query: DashboardSalesQueryDto,
    _user: { userId: string },
  ) {
    return this.getSalesCard(tenantDb, query, 'YTD');
  }

  async getOrdersFulfillment(
    tenantDb: DataSource,
    query: DashboardOrdersQueryDto,
    _user: { userId: string },
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
      this.getNetSales(tenantDb, currentRange, distributorId),
      this.getNetSales(tenantDb, previousRange, distributorId),
      this.getSalesTarget(tenantDb, currentRange, distributorId),
      period === 'MTD'
        ? this.getDailySalesTrend(tenantDb, currentRange, distributorId)
        : this.getMonthlySalesTrend(tenantDb, currentRange, distributorId),
    ]);

    const growthPercent = this.growthPercent(netSales, previousNetSales);
    const achievementPercent = this.percentOf(netSales, target);

    return {
      filters: {
        period,
        date: this.toDateString(anchor),
        dateFrom: this.toDateString(currentRange.start),
        dateTo: this.toDateString(currentRange.end),
        distributorId,
      },
      summary: {
        netSales,
        target,
        growthPercent,
        achievementPercent,
        comparisonLabel: period === 'MTD' ? 'vs last month' : 'vs last year',
      },
      trendSeries,
    };
  }

  private async getNetSales(
    tenantDb: DataSource,
    range: { start: Date; end: Date },
    distributorId: string | null,
  ): Promise<number> {
    const salesQb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('saleOrder')
      .select('COALESCE(SUM(saleOrder.totalAmount), 0)', 'total')
      .where('saleOrder.orderStatus IN (:...statuses)', {
        statuses: [...COUNTABLE_SALE_ORDER_STATUSES],
      })
      .andWhere('saleOrder.orderDate >= :start', { start: range.start })
      .andWhere('saleOrder.orderDate <= :end', {
        end: this.endOfDay(range.end),
      });

    if (distributorId) {
      salesQb.andWhere('saleOrder.distributorId = :distributorId', {
        distributorId,
      });
    }

    const returnsQb = tenantDb
      .getRepository(SaleReturn)
      .createQueryBuilder('saleReturn')
      .select('COALESCE(SUM(saleReturn.returnAmount), 0)', 'total')
      .where('saleReturn.returnStatus IN (:...statuses)', {
        statuses: [...APPROVED_RETURN_STATUSES],
      })
      .andWhere('saleReturn.returnDate >= :start', { start: range.start })
      .andWhere('saleReturn.returnDate <= :end', {
        end: this.endOfDay(range.end),
      });

    if (distributorId) {
      returnsQb.andWhere('saleReturn.distributorId = :distributorId', {
        distributorId,
      });
    }

    const [salesRow, returnsRow] = await Promise.all([
      salesQb.getRawOne<{ total: string }>(),
      returnsQb.getRawOne<{ total: string }>(),
    ]);

    const gross = this.toNumber(salesRow?.total);
    const returns = this.toNumber(returnsRow?.total);
    return Math.max(gross - returns, 0);
  }

  private async getSalesTarget(
    tenantDb: DataSource,
    range: { start: Date; end: Date },
    distributorId: string | null,
  ): Promise<number> {
    // Org-level target: sum SALES_VALUE metrics on published/locked plans
    // that overlap the requested period. distributorId is reserved for
    // future assignee/geo scoping when plans support it.
    void distributorId;

    const row = await tenantDb
      .getRepository(TargetMetricEntity)
      .createQueryBuilder('metric')
      .innerJoin(
        TargetPlanEntity,
        'plan',
        'plan.id = metric.targetPlanId',
      )
      .select('COALESCE(SUM(metric.targetValue), 0)', 'total')
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
  }

  private async getDailySalesTrend(
    tenantDb: DataSource,
    range: { start: Date; end: Date },
    distributorId: string | null,
  ): Promise<Array<{ date: string; value: number }>> {
    const qb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('saleOrder')
      .select(`TO_CHAR(DATE(saleOrder."orderDate"), 'YYYY-MM-DD')`, 'bucket')
      .addSelect('COALESCE(SUM(saleOrder.totalAmount), 0)', 'value')
      .where('saleOrder.orderStatus IN (:...statuses)', {
        statuses: [...COUNTABLE_SALE_ORDER_STATUSES],
      })
      .andWhere('saleOrder.orderDate >= :start', { start: range.start })
      .andWhere('saleOrder.orderDate <= :end', {
        end: this.endOfDay(range.end),
      })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC');

    if (distributorId) {
      qb.andWhere('saleOrder.distributorId = :distributorId', {
        distributorId,
      });
    }

    const rows = await qb.getRawMany<{ bucket: string; value: string }>();
    const byDate = new Map(
      rows.map((row) => [row.bucket, this.toNumber(row.value)]),
    );

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
    range: { start: Date; end: Date },
    distributorId: string | null,
  ): Promise<Array<{ date: string; value: number }>> {
    const qb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('saleOrder')
      .select(`TO_CHAR(DATE_TRUNC('month', saleOrder."orderDate"), 'YYYY-MM')`, 'bucket')
      .addSelect('COALESCE(SUM(saleOrder.totalAmount), 0)', 'value')
      .where('saleOrder.orderStatus IN (:...statuses)', {
        statuses: [...COUNTABLE_SALE_ORDER_STATUSES],
      })
      .andWhere('saleOrder.orderDate >= :start', { start: range.start })
      .andWhere('saleOrder.orderDate <= :end', {
        end: this.endOfDay(range.end),
      })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC');

    if (distributorId) {
      qb.andWhere('saleOrder.distributorId = :distributorId', {
        distributorId,
      });
    }

    const rows = await qb.getRawMany<{ bucket: string; value: string }>();
    const byMonth = new Map(
      rows.map((row) => [row.bucket, this.toNumber(row.value)]),
    );

    const series: Array<{ date: string; value: number }> = [];
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
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
    const assignedExists = `
      EXISTS (
        SELECT 1
        FROM load_sheet_orders lso
        INNER JOIN load_sheets ls ON ls.id = lso."loadSheetId"
        WHERE lso."saleOrderId" = saleOrder.id
          AND ls.status <> :cancelledLoadSheet
      )
    `;

    const qb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('saleOrder')
      .select(
        `SUM(CASE
          WHEN saleOrder.orderStatus = '${OrderStatus.DELIVERED}' THEN 1
          WHEN saleOrder.orderStatus IN ('${OrderStatus.APPROVED}', '${OrderStatus.PROCESSING}')
            AND ${assignedExists} THEN 1
          ELSE 0 END)`,
        'executed',
      )
      .addSelect(
        `SUM(CASE WHEN saleOrder.orderStatus = '${OrderStatus.PENDING}' THEN 1 ELSE 0 END)`,
        'pending',
      )
      .addSelect(
        `SUM(CASE
          WHEN saleOrder.orderStatus IN ('${OrderStatus.APPROVED}', '${OrderStatus.PROCESSING}')
            AND NOT ${assignedExists}
          THEN 1 ELSE 0 END)`,
        'unassigned',
      )
      .where('saleOrder.orderStatus IN (:...statuses)', {
        statuses: [...FULFILLMENT_ORDER_STATUSES],
      })
      .andWhere('saleOrder.orderDate >= :start', { start: range.start })
      .andWhere('saleOrder.orderDate < :end', { end: range.end })
      .setParameter('cancelledLoadSheet', LoadSheetStatus.CANCELLED);

    if (distributorId) {
      qb.andWhere('saleOrder.distributorId = :distributorId', {
        distributorId,
      });
    }

    const row = await qb.getRawOne<{
      executed: string;
      pending: string;
      unassigned: string;
    }>();

    return {
      executed: this.toNumber(row?.executed),
      pending: this.toNumber(row?.pending),
      unassigned: this.toNumber(row?.unassigned),
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
