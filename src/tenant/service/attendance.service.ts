import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import {
  Attendence,
  AttendenceStatus,
  TrackingLog,
} from 'src/tenant-db/entities/attendence.entity';
import { ActivityLogService } from './activity-log.service';
import { CheckInAttendanceDto } from '../dto/attendance/check-in-attendance.dto';
import { CheckOutAttendanceDto } from '../dto/attendance/check-out-attendance.dto';
import { ListAttendanceDto } from '../dto/attendance/list-attendance.dto';
import { CreateTrackingLogDto } from '../dto/attendance/create-tracking-log.dto';

@Injectable()
export class AttendanceService {
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

  private async assertDistributor(
    tenantDb: DataSource,
    distributorId: string,
  ): Promise<void> {
    const distributor = await tenantDb.getRepository(Distributor).findOne({
      where: { id: distributorId, isDeleted: false },
      select: ['id'],
    });
    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }
  }

  private async resolveOwnedAttendance(
    tenantDb: DataSource,
    attendanceId: string,
    userId: string,
  ): Promise<Attendence> {
    const attendance = await tenantDb.getRepository(Attendence).findOne({
      where: { id: attendanceId },
    });
    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }
    if (attendance.userId !== userId) {
      throw new ForbiddenException('Not allowed to access this attendance record');
    }
    return attendance;
  }

  async checkIn(
    tenantDb: DataSource,
    distributorId: string,
    dto: CheckInAttendanceDto,
    user: { userId: string },
  ) {
    const normalizedDistributorId = distributorId?.trim();
    if (!normalizedDistributorId) {
      throw new BadRequestException('distributorId query parameter is required');
    }

    await this.assertDistributor(tenantDb, normalizedDistributorId);

    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const repo = tenantDb.getRepository(Attendence);
    const existingToday = await repo
      .createQueryBuilder('a')
      .where('a."userId" = :userId', { userId: user.userId })
      .andWhere('a."distributorId" = :distributorId', {
        distributorId: normalizedDistributorId,
      })
      .andWhere('a."attendenceDate" >= :today', { today })
      .andWhere('a."attendenceDate" < :tomorrow', { tomorrow })
      .getOne();

    if (existingToday) {
      if (!existingToday.checkOutTime) {
        throw new BadRequestException(
          'Already checked in for this distributor today. Check out first.',
        );
      }
      throw new BadRequestException(
        'Attendance for this distributor is already completed today',
      );
    }

    const now = new Date();
    const attendance = await repo.save(
      repo.create({
        userId: user.userId,
        distributorId: normalizedDistributorId,
        attendenceDate: today,
        checkInLocation: dto.checkInLocation?.trim() || null,
        checkInTime: now,
        checkInLatitude: dto.checkInLatitude,
        checkInLongitude: dto.checkInLongitude,
        status: dto.status ?? AttendenceStatus.PRESENT,
      }),
    );

    await tenantDb.getRepository(TrackingLog).save(
      tenantDb.getRepository(TrackingLog).create({
        userId: user.userId,
        attendenceId: attendance.id,
        latitude: dto.checkInLatitude,
        longitude: dto.checkInLongitude,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ATTENDANCE_CHECKED_IN',
      description: 'Attendance check-in recorded',
      metadata: {
        attendanceId: attendance.id,
        distributorId: normalizedDistributorId,
      },
    });

    return this.viewAttendance(tenantDb, attendance.id, user, {
      recordActivityLog: false,
    });
  }

  async checkOut(
    tenantDb: DataSource,
    distributorId: string,
    dto: CheckOutAttendanceDto,
    user: { userId: string },
  ) {
    const normalizedDistributorId = distributorId?.trim();
    if (!normalizedDistributorId) {
      throw new BadRequestException('distributorId query parameter is required');
    }

    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const repo = tenantDb.getRepository(Attendence);
    const attendance = await repo
      .createQueryBuilder('a')
      .where('a."userId" = :userId', { userId: user.userId })
      .andWhere('a."distributorId" = :distributorId', {
        distributorId: normalizedDistributorId,
      })
      .andWhere('a."attendenceDate" >= :today', { today })
      .andWhere('a."attendenceDate" < :tomorrow', { tomorrow })
      .getOne();

    if (!attendance) {
      throw new NotFoundException(
        'No check-in found for this distributor today',
      );
    }

    if (!attendance.checkInTime) {
      throw new BadRequestException('Attendance has no check-in time');
    }

    if (attendance.checkOutTime) {
      throw new BadRequestException('Already checked out for today');
    }

    attendance.checkOutLocation = dto.checkOutLocation?.trim() || null;
    attendance.checkOutTime = new Date();
    attendance.checkOutLatitude = dto.checkOutLatitude;
    attendance.checkOutLongitude = dto.checkOutLongitude;

    await repo.save(attendance);

    await tenantDb.getRepository(TrackingLog).save(
      tenantDb.getRepository(TrackingLog).create({
        userId: user.userId,
        attendenceId: attendance.id,
        latitude: dto.checkOutLatitude,
        longitude: dto.checkOutLongitude,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ATTENDANCE_CHECKED_OUT',
      description: 'Attendance check-out recorded',
      metadata: {
        attendanceId: attendance.id,
        distributorId: normalizedDistributorId,
      },
    });

    return this.viewAttendance(tenantDb, attendance.id, user, {
      recordActivityLog: false,
    });
  }

  async listHistory(
    tenantDb: DataSource,
    filters: ListAttendanceDto,
    user: { userId: string },
  ) {
    const page = this.normalizePage(filters.page);
    const limit = this.normalizeLimit(filters.limit);
    const dateFrom = this.parseOptionalDayBoundary(filters.dateFrom);
    const dateTo = this.parseOptionalDayBoundary(filters.dateTo);

    const qb = tenantDb
      .getRepository(Attendence)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.distributor', 'distributor')
      .where('a."userId" = :userId', { userId: user.userId });

    if (filters.distributorId) {
      qb.andWhere('a."distributorId" = :distributorId', {
        distributorId: filters.distributorId,
      });
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    if (dateFrom) {
      qb.andWhere('a."attendenceDate" >= :dateFrom', {
        dateFrom: this.startOfDay(dateFrom),
      });
    }
    if (dateTo) {
      qb.andWhere('a."attendenceDate" <= :dateTo', {
        dateTo: this.endOfDay(dateTo),
      });
    }

    const total = await qb.clone().getCount();

    const rows = await qb
      .clone()
      .select([
        'a.id',
        'a.attendenceDate',
        'a.checkInTime',
        'a.checkOutTime',
        'a.checkInLocation',
        'a.checkOutLocation',
        'a.status',
        'a.createdAt',
        'distributor.id',
        'distributor.name',
      ])
      .orderBy('a.attendenceDate', 'DESC')
      .addOrderBy('a.checkInTime', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ATTENDANCE_LISTED',
      description: 'Attendance history listed',
      metadata: { total, page, limit },
    });

    return {
      result: rows,
      meta: { total, page, limit },
    };
  }

  async viewAttendance(
    tenantDb: DataSource,
    id: string,
    user: { userId: string },
    options?: { recordActivityLog?: boolean },
  ) {
    const attendance = await tenantDb.getRepository(Attendence).findOne({
      where: { id },
      relations: ['distributor', 'user'],
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (attendance.userId !== user.userId) {
      throw new ForbiddenException('Not allowed to view this attendance record');
    }

    if (options?.recordActivityLog !== false) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'ATTENDANCE_VIEWED',
        description: 'Attendance record viewed',
        metadata: { attendanceId: attendance.id },
      });
    }

    return attendance;
  }

  async getTrackingLogs(
    tenantDb: DataSource,
    attendanceId: string,
    user: { userId: string },
  ) {
    await this.resolveOwnedAttendance(tenantDb, attendanceId, user.userId);

    const logs = await tenantDb.getRepository(TrackingLog).find({
      where: { attendenceId: attendanceId },
      order: { createdAt: 'ASC' },
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ATTENDANCE_TRACKING_LOGS_LISTED',
      description: 'Attendance tracking logs listed',
      metadata: { attendanceId, count: logs.length },
    });

    return logs;
  }

  async addTrackingLog(
    tenantDb: DataSource,
    attendanceId: string,
    dto: CreateTrackingLogDto,
    user: { userId: string },
  ) {
    const attendance = await this.resolveOwnedAttendance(
      tenantDb,
      attendanceId,
      user.userId,
    );

    if (!attendance.checkInTime) {
      throw new BadRequestException('Attendance is not checked in');
    }

    if (attendance.checkOutTime) {
      throw new BadRequestException(
        'Cannot add tracking logs after check-out',
      );
    }

    const repo = tenantDb.getRepository(TrackingLog);
    const logs = await repo.save(
      dto.logs.map((entry) =>
        repo.create({
          userId: user.userId,
          attendenceId: attendanceId,
          latitude: entry.latitude,
          longitude: entry.longitude,
        }),
      ),
    );

    return logs;
  }
}
