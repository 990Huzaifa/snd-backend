import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  Attendence,
  TrackingLog,
} from 'src/tenant-db/entities/attendence.entity';
import { PJP, PJPRoute, PJPStatus } from 'src/tenant-db/entities/pjp.entity';
import {
  Retailer,
  RetailerAttendence,
  RetailerVisit,
} from 'src/tenant-db/entities/retailer.entity';
import { Route, RouteShare } from 'src/tenant-db/entities/route.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { SalesmanTrackingReportDto } from '../../dto/report/salesman-tracking-report.dto';
import { ActivityLogService } from '../activity-log.service';

@Injectable()
export class SalesmanTrackingReportService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private toNumber(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private parseDayRange(dateValue: string): { start: Date; next: Date } {
    const normalized = (dateValue ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('date is required');
    }

    const start = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException(`Invalid date: ${dateValue}`);
    }

    const next = new Date(start);
    next.setUTCDate(next.getUTCDate() + 1);

    return { start, next };
  }

  private async resolveRouteIdsForDay(
    tenantDb: DataSource,
    salesmanId: string,
    start: Date,
    next: Date,
  ): Promise<string[]> {
    const pjpRoutes = await tenantDb
      .getRepository(PJPRoute)
      .createQueryBuilder('pr')
      .innerJoin(PJP, 'pjp', 'pjp.id = pr.pjpId')
      .select('pr.routeId', 'routeId')
      .where('pjp.salesmanId = :salesmanId', { salesmanId })
      .andWhere('pjp.status = :status', { status: PJPStatus.ACTIVE })
      .andWhere('pr.visitDate >= :start', { start })
      .andWhere('pr.visitDate < :next', { next })
      .getRawMany<{ routeId: string }>();

    const sharedRoutes = await tenantDb
      .getRepository(RouteShare)
      .createQueryBuilder('rs')
      .select('rs.routeId', 'routeId')
      .where('rs.toSalesmanId = :salesmanId', { salesmanId })
      .andWhere('rs.visitDate >= :start', { start })
      .andWhere('rs.visitDate < :next', { next })
      .getRawMany<{ routeId: string }>();

    return [
      ...new Set([
        ...pjpRoutes.map((row) => row.routeId),
        ...sharedRoutes.map((row) => row.routeId),
      ]),
    ];
  }

  async getDayTracking(
    tenantDb: DataSource,
    dto: SalesmanTrackingReportDto,
    actor: { userId: string },
  ) {
    const salesmanId = dto.salesmanId.trim();
    const date = dto.date.trim();
    const { start, next } = this.parseDayRange(date);

    const salesman = await tenantDb.getRepository(User).findOne({
      where: { id: salesmanId, isDeleted: false },
      relations: ['designation'],
    });

    if (!salesman) {
      throw new NotFoundException('Salesman not found');
    }

    const routeIds = await this.resolveRouteIdsForDay(
      tenantDb,
      salesmanId,
      start,
      next,
    );

    const routes = routeIds.length
      ? await tenantDb.getRepository(Route).find({
          where: { id: In(routeIds) },
          relations: ['area', 'distributor'],
          order: { name: 'ASC' },
        })
      : [];

    const retailers = routeIds.length
      ? await tenantDb.getRepository(Retailer).find({
          where: { routeId: In(routeIds) },
          order: { shopName: 'ASC' },
        })
      : [];

    const dayCheckIns = await tenantDb
      .getRepository(RetailerAttendence)
      .createQueryBuilder('ra')
      .leftJoinAndSelect('ra.retailer', 'retailer')
      .leftJoinAndSelect('retailer.route', 'route')
      .where('ra.userId = :salesmanId', { salesmanId })
      .andWhere('ra.attendenceDate >= :start', { start })
      .andWhere('ra.attendenceDate < :next', { next })
      .orderBy('ra.createdAt', 'ASC')
      .getMany();

    const visits = await tenantDb
      .getRepository(RetailerVisit)
      .createQueryBuilder('visit')
      .where('visit.userId = :salesmanId', { salesmanId })
      .andWhere('visit.createdAt >= :start', { start })
      .andWhere('visit.createdAt < :next', { next })
      .orderBy('visit.createdAt', 'DESC')
      .getMany();

    const visitByRetailerId = new Map<string, RetailerVisit>();
    for (const visit of visits) {
      if (!visitByRetailerId.has(visit.retailerId)) {
        visitByRetailerId.set(visit.retailerId, visit);
      }
    }

    const checkInByRetailerId = new Map<string, RetailerAttendence>();
    for (const checkIn of dayCheckIns) {
      const existing = checkInByRetailerId.get(checkIn.retailerId);
      if (!existing || checkIn.createdAt < existing.createdAt) {
        checkInByRetailerId.set(checkIn.retailerId, checkIn);
      }
    }

    const routeRetailerIdSet = new Set(retailers.map((r) => r.id));

    const retailerRows = retailers.map((retailer) => {
      const checkIn = checkInByRetailerId.get(retailer.id) ?? null;
      const visit = visitByRetailerId.get(retailer.id) ?? null;

      return {
        id: retailer.id,
        shopName: retailer.shopName,
        locationTitle: retailer.locationTitle,
        address: retailer.address,
        latitude: this.toNumber(retailer.latitude),
        longitude: this.toNumber(retailer.longitude),
        routeId: retailer.routeId,
        checkIn: checkIn
          ? {
              id: checkIn.id,
              checkInTime: checkIn.createdAt,
              checkinLatitude: this.toNumber(checkIn.checkinLatitude),
              checkinLongitude: this.toNumber(checkIn.checkinLongitude),
            }
          : null,
        visit: visit
          ? {
              id: visit.id,
              visitStatus: visit.visitStatus,
              notes: visit.notes,
              createdAt: visit.createdAt,
            }
          : null,
      };
    });

    const offRouteCheckIns = dayCheckIns
      .filter((checkIn) => !routeRetailerIdSet.has(checkIn.retailerId))
      .map((checkIn) => {
        const visit = visitByRetailerId.get(checkIn.retailerId) ?? null;
        return {
          id: checkIn.id,
          checkInTime: checkIn.createdAt,
          checkinLatitude: this.toNumber(checkIn.checkinLatitude),
          checkinLongitude: this.toNumber(checkIn.checkinLongitude),
          retailer: checkIn.retailer
            ? {
                id: checkIn.retailer.id,
                shopName: checkIn.retailer.shopName,
                locationTitle: checkIn.retailer.locationTitle,
                latitude: this.toNumber(checkIn.retailer.latitude),
                longitude: this.toNumber(checkIn.retailer.longitude),
                routeId: checkIn.retailer.routeId,
              }
            : null,
          route: checkIn.retailer?.route
            ? {
                id: checkIn.retailer.route.id,
                name: checkIn.retailer.route.name,
              }
            : null,
          visit: visit
            ? {
                id: visit.id,
                visitStatus: visit.visitStatus,
                notes: visit.notes,
                createdAt: visit.createdAt,
              }
            : null,
        };
      });

    const dayAttendance = await tenantDb
      .getRepository(Attendence)
      .createQueryBuilder('a')
      .where('a.userId = :salesmanId', { salesmanId })
      .andWhere('a.attendenceDate >= :start', { start })
      .andWhere('a.attendenceDate < :next', { next })
      .orderBy('a.checkInTime', 'ASC')
      .getMany();

    const attendanceIds = dayAttendance.map((row) => row.id);
    const trackingLogs = attendanceIds.length
      ? await tenantDb.getRepository(TrackingLog).find({
          where: { attendenceId: In(attendanceIds) },
          order: { logTime: 'ASC' },
        })
      : [];

    const visitedCount = retailerRows.filter((row) => row.checkIn).length;
    const checkInTimes = dayCheckIns.map((c) => c.createdAt.getTime());

    const summary = {
      totalRetailers: retailerRows.length,
      visitedCount,
      pendingCount: retailerRows.length - visitedCount,
      trackingPointCount: trackingLogs.length,
      firstCheckInAt:
        checkInTimes.length > 0
          ? new Date(Math.min(...checkInTimes))
          : null,
      lastCheckInAt:
        checkInTimes.length > 0
          ? new Date(Math.max(...checkInTimes))
          : null,
    };

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actor.userId,
      action: 'SALESMAN_TRACKING_REPORT_VIEWED',
      description: 'Salesman tracking report viewed',
      metadata: {
        salesmanId,
        date,
        routeCount: routes.length,
        totalRetailers: summary.totalRetailers,
        visitedCount: summary.visitedCount,
        trackingPointCount: summary.trackingPointCount,
      },
    });

    return {
      filters: {
        salesmanId,
        date,
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
      routes: routes.map((route) => ({
        id: route.id,
        name: route.name,
        distributorId: route.distributorId,
        areaId: route.areaId,
        area: route.area
          ? { id: route.area.id, name: route.area.name }
          : null,
        distributor: route.distributor
          ? { id: route.distributor.id, name: route.distributor.name }
          : null,
      })),
      attendance: dayAttendance.map((row) => ({
        id: row.id,
        distributorId: row.distributorId,
        status: row.status,
        checkInTime: row.checkInTime,
        checkOutTime: row.checkOutTime,
        checkInLatitude: this.toNumber(row.checkInLatitude),
        checkInLongitude: this.toNumber(row.checkInLongitude),
        checkOutLatitude: this.toNumber(row.checkOutLatitude),
        checkOutLongitude: this.toNumber(row.checkOutLongitude),
        checkInLocation: row.checkInLocation,
        checkOutLocation: row.checkOutLocation,
      })),
      summary,
      retailers: retailerRows,
      trackingPath: trackingLogs.map((log) => ({
        id: log.id,
        latitude: this.toNumber(log.latitude),
        longitude: this.toNumber(log.longitude),
        logTime: log.logTime,
        attendenceId: log.attendenceId,
      })),
      offRouteCheckIns,
    };
  }
}
