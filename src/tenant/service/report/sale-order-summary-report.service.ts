import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Attendence } from 'src/tenant-db/entities/attendence.entity';
import { PJP, PJPRoute, PJPStatus } from 'src/tenant-db/entities/pjp.entity';
import { Retailer, RetailerAttendence } from 'src/tenant-db/entities/retailer.entity';
import { Route, RouteShare } from 'src/tenant-db/entities/route.entity';
import {
  OrderStatus,
  SaleOrder,
} from 'src/tenant-db/entities/saleorder.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { SaleOrderSummaryReportDto } from '../../dto/report/sale-order-summary-report.dto';
import { ActivityLogService } from '../activity-log.service';

type DayRow = {
  date: string;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  distributor: { id: string; name: string } | null;
  totalShops: number;
  visitedShops: number;
  productiveShops: number;
  nonProductiveShops: number;
  orderTotalAmount: number;
};

@Injectable()
export class SaleOrderSummaryReportService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private toNumber(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private toDateKey(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }

  private parseDayStart(dateValue: string): Date {
    const normalized = (dateValue ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('Date is required');
    }
    const start = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException(`Invalid date: ${dateValue}`);
    }
    return start;
  }

  private eachDateKey(start: Date, endInclusive: Date): string[] {
    const keys: string[] = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= endInclusive.getTime()) {
      keys.push(this.toDateKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  }

  async getOverview(
    tenantDb: DataSource,
    dto: SaleOrderSummaryReportDto,
    actor: { userId: string },
  ) {
    const salesmanId = dto.salesmanId.trim();
    const startDate = dto.startDate.trim();
    const endDate = dto.endDate.trim();

    if (startDate > endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    const rangeStart = this.parseDayStart(startDate);
    const rangeEndExclusive = this.parseDayStart(endDate);
    rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);
    const rangeEndInclusive = new Date(rangeEndExclusive);
    rangeEndInclusive.setUTCMilliseconds(
      rangeEndInclusive.getUTCMilliseconds() - 1,
    );

    const salesman = await tenantDb.getRepository(User).findOne({
      where: { id: salesmanId, isDeleted: false },
      relations: ['designation'],
    });

    if (!salesman) {
      throw new NotFoundException('Salesman not found');
    }

    const pjpRoutes = await tenantDb
      .getRepository(PJPRoute)
      .createQueryBuilder('pr')
      .innerJoin(PJP, 'pjp', 'pjp.id = pr.pjpId')
      .select('pr.routeId', 'routeId')
      .addSelect('pr.visitDate', 'visitDate')
      .where('pjp.salesmanId = :salesmanId', { salesmanId })
      .andWhere('pjp.status = :status', { status: PJPStatus.ACTIVE })
      .andWhere('pr.visitDate >= :rangeStart', { rangeStart })
      .andWhere('pr.visitDate < :rangeEndExclusive', { rangeEndExclusive })
      .getRawMany<{ routeId: string; visitDate: Date }>();

    const sharedRoutes = await tenantDb
      .getRepository(RouteShare)
      .createQueryBuilder('rs')
      .select('rs.routeId', 'routeId')
      .addSelect('rs.visitDate', 'visitDate')
      .where('rs.toSalesmanId = :salesmanId', { salesmanId })
      .andWhere('rs.visitDate >= :rangeStart', { rangeStart })
      .andWhere('rs.visitDate < :rangeEndExclusive', { rangeEndExclusive })
      .getRawMany<{ routeId: string; visitDate: Date }>();

    const routeIdsByDate = new Map<string, Set<string>>();
    for (const row of [...pjpRoutes, ...sharedRoutes]) {
      const dateKey = this.toDateKey(row.visitDate);
      if (!routeIdsByDate.has(dateKey)) {
        routeIdsByDate.set(dateKey, new Set());
      }
      routeIdsByDate.get(dateKey)!.add(row.routeId);
    }

    const allRouteIds = [
      ...new Set(
        [...routeIdsByDate.values()].flatMap((set) => [...set]),
      ),
    ];

    const routes = allRouteIds.length
      ? await tenantDb.getRepository(Route).find({
          where: { id: In(allRouteIds) },
          relations: ['distributor'],
        })
      : [];
    const routeById = new Map(routes.map((route) => [route.id, route]));

    const retailers = allRouteIds.length
      ? await tenantDb.getRepository(Retailer).find({
          where: { routeId: In(allRouteIds) },
          select: ['id', 'routeId'],
        })
      : [];

    const retailerIdsByRouteId = new Map<string, string[]>();
    for (const retailer of retailers) {
      const list = retailerIdsByRouteId.get(retailer.routeId) ?? [];
      list.push(retailer.id);
      retailerIdsByRouteId.set(retailer.routeId, list);
    }

    const dayCheckIns = await tenantDb
      .getRepository(RetailerAttendence)
      .createQueryBuilder('ra')
      .where('ra.userId = :salesmanId', { salesmanId })
      .andWhere('ra.attendenceDate >= :rangeStart', { rangeStart })
      .andWhere('ra.attendenceDate < :rangeEndExclusive', {
        rangeEndExclusive,
      })
      .getMany();

    const visitedRetailerIdsByDate = new Map<string, Set<string>>();
    for (const checkIn of dayCheckIns) {
      const dateKey = this.toDateKey(checkIn.attendenceDate);
      if (!visitedRetailerIdsByDate.has(dateKey)) {
        visitedRetailerIdsByDate.set(dateKey, new Set());
      }
      visitedRetailerIdsByDate.get(dateKey)!.add(checkIn.retailerId);
    }

    const dayAttendance = await tenantDb
      .getRepository(Attendence)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.distributor', 'distributor')
      .where('a.userId = :salesmanId', { salesmanId })
      .andWhere('a.attendenceDate >= :rangeStart', { rangeStart })
      .andWhere('a.attendenceDate < :rangeEndExclusive', {
        rangeEndExclusive,
      })
      .orderBy('a.checkInTime', 'ASC')
      .getMany();

    const attendanceByDate = new Map<string, Attendence>();
    for (const row of dayAttendance) {
      const dateKey = this.toDateKey(row.attendenceDate);
      if (!attendanceByDate.has(dateKey)) {
        attendanceByDate.set(dateKey, row);
      }
    }

    const orders = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .where('so.salesmanId = :salesmanId', { salesmanId })
      .andWhere('so.orderDate >= :rangeStart', { rangeStart })
      .andWhere('so.orderDate < :rangeEndExclusive', { rangeEndExclusive })
      .andWhere('so.orderStatus NOT IN (:...excludedStatuses)', {
        excludedStatuses: [OrderStatus.CANCELLED, OrderStatus.REJECTED],
      })
      .getMany();

    const productiveRetailerIdsByDate = new Map<string, Set<string>>();
    const orderAmountByDate = new Map<string, number>();
    for (const order of orders) {
      const dateKey = this.toDateKey(order.orderDate);
      if (!productiveRetailerIdsByDate.has(dateKey)) {
        productiveRetailerIdsByDate.set(dateKey, new Set());
      }
      productiveRetailerIdsByDate.get(dateKey)!.add(order.retailerId);
      orderAmountByDate.set(
        dateKey,
        (orderAmountByDate.get(dateKey) ?? 0) + this.toNumber(order.totalAmount),
      );
    }

    const dateKeys = this.eachDateKey(rangeStart, this.parseDayStart(endDate));
    const rows: DayRow[] = dateKeys.map((dateKey) => {
      const routeIds = [...(routeIdsByDate.get(dateKey) ?? [])];
      const totalShopIds = new Set<string>();
      const distributorsById = new Map<string, { id: string; name: string }>();

      for (const routeId of routeIds) {
        const route = routeById.get(routeId);
        if (route?.distributor) {
          distributorsById.set(route.distributor.id, {
            id: route.distributor.id,
            name: route.distributor.name,
          });
        }
        for (const retailerId of retailerIdsByRouteId.get(routeId) ?? []) {
          totalShopIds.add(retailerId);
        }
      }

      const visitedIds = visitedRetailerIdsByDate.get(dateKey) ?? new Set();
      const productiveIds =
        productiveRetailerIdsByDate.get(dateKey) ?? new Set();

      let nonProductive = 0;
      for (const retailerId of visitedIds) {
        if (!productiveIds.has(retailerId)) {
          nonProductive += 1;
        }
      }

      const attendance = attendanceByDate.get(dateKey) ?? null;
      let distributor: { id: string; name: string } | null = null;
      if (attendance?.distributor) {
        distributor = {
          id: attendance.distributor.id,
          name: attendance.distributor.name,
        };
      } else if (distributorsById.size === 1) {
        distributor = [...distributorsById.values()][0];
      } else if (distributorsById.size > 1) {
        distributor = [...distributorsById.values()][0];
      }

      return {
        date: dateKey,
        checkInTime: attendance?.checkInTime ?? null,
        checkOutTime: attendance?.checkOutTime ?? null,
        distributor,
        totalShops: totalShopIds.size,
        visitedShops: visitedIds.size,
        productiveShops: productiveIds.size,
        nonProductiveShops: nonProductive,
        orderTotalAmount: Number(
          (orderAmountByDate.get(dateKey) ?? 0).toFixed(2),
        ),
      };
    });

    const summary = {
      totalShops: rows.reduce((sum, row) => sum + row.totalShops, 0),
      visitedShops: rows.reduce((sum, row) => sum + row.visitedShops, 0),
      productiveShops: rows.reduce((sum, row) => sum + row.productiveShops, 0),
      nonProductiveShops: rows.reduce(
        (sum, row) => sum + row.nonProductiveShops,
        0,
      ),
      orderTotalAmount: Number(
        rows
          .reduce((sum, row) => sum + row.orderTotalAmount, 0)
          .toFixed(2),
      ),
      days: rows.length,
      daysWithCheckIn: rows.filter((row) => row.checkInTime).length,
    };

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actor.userId,
      action: 'SALE_ORDER_SUMMARY_REPORT_VIEWED',
      description: 'Sale order summary report viewed',
      metadata: {
        salesmanId,
        startDate,
        endDate,
        days: summary.days,
        orderTotalAmount: summary.orderTotalAmount,
      },
    });

    return {
      filters: {
        salesmanId,
        startDate,
        endDate,
      },
      salesman: {
        id: salesman.id,
        name: salesman.name,
        code: salesman.code,
        type: salesman.type,
        designation: salesman.designation
          ? {
              id: salesman.designation.id,
              name: salesman.designation.name,
            }
          : null,
      },
      summary,
      rows,
    };
  }
}
