import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  isWithinRadiusKm,
  parseGeoCoordinate,
  parseMaxRadiusKm,
} from 'src/common/geo/geo.util';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import {
  Attendence,
  AttendenceStatus,
  TrackingLog,
} from 'src/tenant-db/entities/attendence.entity';
import { User, UserType } from 'src/tenant-db/entities/user.entity';
import { ActivityLogService } from './activity-log.service';
import { AppAttendanceOverviewDto } from '../dto/attendance/app-attendance-overview.dto';
import { AttendanceOverviewDto } from '../dto/attendance/attendance-overview.dto';
import { CheckInAttendanceDto } from '../dto/attendance/check-in-attendance.dto';
import { CheckOutAttendanceDto } from '../dto/attendance/check-out-attendance.dto';
import { ListAttendanceDto } from '../dto/attendance/list-attendance.dto';
import { CreateTrackingLogDto } from '../dto/attendance/create-tracking-log.dto';

type AttendanceDayCode = 'P' | 'A' | 'HD' | 'L' | 'W' | 'NA';

type AttendanceRecordStatus =
  | 'present'
  | 'absent'
  | 'leave'
  | 'weekend'
  | 'future';

type AttendanceGeofence = {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  source: 'user' | 'distributor';
};

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

  private getMonthDateRange(year: number, month: number) {
    const start = this.startOfDay(new Date(year, month - 1, 1));
    const end = this.endOfDay(new Date(year, month, 0));
    return { start, end, daysInMonth: end.getDate() };
  }

  private countWorkableDaysInMonth(year: number, month: number): number {
    const daysInMonth = new Date(year, month, 0).getDate();
    let count = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count += 1;
      }
    }
    return count;
  }

  private countElapsedWorkableDaysInMonth(year: number, month: number): number {
    const today = this.startOfDay(new Date());
    const monthStart = this.startOfDay(new Date(year, month - 1, 1));
    const monthEnd = this.endOfDay(new Date(year, month, 0));

    if (today < monthStart) {
      return 0;
    }

    const lastDay =
      today > monthEnd ? new Date(year, month, 0).getDate() : today.getDate();

    let count = 0;
    for (let day = 1; day <= lastDay; day += 1) {
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count += 1;
      }
    }
    return count;
  }

  private isFutureDay(year: number, month: number, day: number): boolean {
    const today = this.startOfDay(new Date());
    const target = this.startOfDay(new Date(year, month - 1, day));
    return target > today;
  }

  private toDateKey(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isWeekend(year: number, month: number, day: number): boolean {
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  private weekdayLabel(year: number, month: number, day: number): string {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
      new Date(year, month - 1, day).getDay()
    ];
  }

  private isPresentLikeStatus(status: AttendenceStatus): boolean {
    return (
      status === AttendenceStatus.PRESENT ||
      status === AttendenceStatus.WORK_FROM_HOME ||
      status === AttendenceStatus.REMOTE
    );
  }

  private isHalfDayRecord(record: Attendence): boolean {
    return (
      record.status === AttendenceStatus.PRESENT &&
      Boolean(record.checkInTime) &&
      !record.checkOutTime
    );
  }

  private resolveDayCode(
    records: Attendence[],
    weekend: boolean,
    isFuture = false,
  ): AttendanceDayCode {
    if (!records.length) {
      if (isFuture) {
        return weekend ? 'W' : 'NA';
      }
      return weekend ? 'W' : 'A';
    }

    if (records.some((record) => record.status === AttendenceStatus.LEAVE)) {
      return 'L';
    }

    if (records.every((record) => record.status === AttendenceStatus.ABSENT)) {
      return 'A';
    }

    const presentLike = records.filter((record) =>
      this.isPresentLikeStatus(record.status),
    );
    if (presentLike.length) {
      const hasFullPresent = presentLike.some(
        (record) => !this.isHalfDayRecord(record),
      );
      if (hasFullPresent) {
        return 'P';
      }
      return 'HD';
    }

    return weekend ? 'W' : 'A';
  }

  private pickPrimaryAttendanceRecord(
    records: Attendence[],
  ): Attendence | null {
    if (!records.length) {
      return null;
    }

    return [...records].sort(
      (left, right) =>
        (right.checkInTime?.getTime() ?? 0) - (left.checkInTime?.getTime() ?? 0),
    )[0];
  }

  private roundAttendanceRate(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private mapDayCodeToStatus(code: AttendanceDayCode): AttendanceRecordStatus {
    if (code === 'P' || code === 'HD') {
      return 'present';
    }
    if (code === 'A') {
      return 'absent';
    }
    if (code === 'L') {
      return 'leave';
    }
    if (code === 'W') {
      return 'weekend';
    }
    return 'future';
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  private formatWorkingHours(checkIn: Date, checkOut: Date): string {
    const diffMs = checkOut.getTime() - checkIn.getTime();
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  private resolveAttendanceMessage(rate: number): string {
    if (rate >= 90) {
      return 'Excellent attendance! Keep it up.';
    }
    if (rate >= 75) {
      return 'Good attendance. Keep improving.';
    }
    if (rate >= 50) {
      return 'Attendance needs improvement.';
    }
    return 'Poor attendance. Please be more regular.';
  }

  private resolveUserGeofence(
    user: Pick<User, 'latitude' | 'longitude' | 'maxRadius'>,
  ): AttendanceGeofence {
    try {
      return {
        centerLat: parseGeoCoordinate(user.latitude, 'latitude'),
        centerLng: parseGeoCoordinate(user.longitude, 'longitude'),
        radiusKm: parseMaxRadiusKm(user.maxRadius),
        source: 'user',
      };
    } catch {
      throw new BadRequestException('Invalid user location configuration');
    }
  }

  private async findTodayAttendance(
    tenantDb: DataSource,
    userId: string,
    distributorId: string | null,
  ): Promise<Attendence | null> {
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const qb = tenantDb
      .getRepository(Attendence)
      .createQueryBuilder('a')
      .where('a."userId" = :userId', { userId })
      .andWhere('a."attendenceDate" >= :today', { today })
      .andWhere('a."attendenceDate" < :tomorrow', { tomorrow });

    if (distributorId) {
      qb.andWhere('a."distributorId" = :distributorId', { distributorId });
    } else {
      qb.andWhere('a."distributorId" IS NULL');
    }

    return qb.getOne();
  }

  private async findActiveTodayAttendance(
    tenantDb: DataSource,
    userId: string,
  ): Promise<Attendence | null> {
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return tenantDb
      .getRepository(Attendence)
      .createQueryBuilder('a')
      .where('a."userId" = :userId', { userId })
      .andWhere('a."attendenceDate" >= :today', { today })
      .andWhere('a."attendenceDate" < :tomorrow', { tomorrow })
      .andWhere('a."checkOutTime" IS NULL')
      .orderBy('a."checkInTime"', 'DESC')
      .getOne();
  }

  private async assertDistributor(
    tenantDb: DataSource,
    distributorId: string,
  ): Promise<Pick<Distributor, 'id' | 'latitude' | 'longitude' | 'maxRadius'>> {
    const distributor = await tenantDb.getRepository(Distributor).findOne({
      where: { id: distributorId, isDeleted: false },
      select: ['id', 'latitude', 'longitude', 'maxRadius'],
    });
    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }
    return distributor;
  }

  private hasCompleteUserGeofence(
    user: Pick<User, 'latitude' | 'longitude' | 'maxRadius'>,
  ): boolean {
    const lat = user.latitude?.trim();
    const lng = user.longitude?.trim();
    const radius = user.maxRadius?.trim();
    return Boolean(lat && lng && radius);
  }

  private resolveAttendanceGeofence(
    user: Pick<User, 'latitude' | 'longitude' | 'maxRadius'>,
    distributor: Pick<Distributor, 'latitude' | 'longitude' | 'maxRadius'>,
  ): AttendanceGeofence {
    const useUserGeofence = this.hasCompleteUserGeofence(user);
    const source = useUserGeofence ? user : distributor;

    try {
      return {
        centerLat: parseGeoCoordinate(source.latitude, 'latitude'),
        centerLng: parseGeoCoordinate(source.longitude, 'longitude'),
        radiusKm: parseMaxRadiusKm(source.maxRadius),
        source: useUserGeofence ? 'user' : 'distributor',
      };
    } catch {
      throw new BadRequestException(
        useUserGeofence
          ? 'Invalid user location configuration'
          : 'Invalid distributor location configuration',
      );
    }
  }

  private assertWithinAttendanceArea(
    checkLat: number,
    checkLng: number,
    geofence: AttendanceGeofence,
  ): void {
    if (
      !isWithinRadiusKm(
        checkLat,
        checkLng,
        geofence.centerLat,
        geofence.centerLng,
        geofence.radiusKm,
      )
    ) {
      throw new BadRequestException('You are outside the allowed check-in area');
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
    return attendance;
  }

  async checkIn(
    tenantDb: DataSource,
    dto: CheckInAttendanceDto,
    user: { userId: string },
  ) {
    const attendanceUser = await tenantDb.getRepository(User).findOne({
      where: { id: user.userId, isDeleted: false },
      select: ['id', 'latitude', 'longitude', 'maxRadius'],
    });
    if (!attendanceUser) {
      throw new NotFoundException('User not found');
    }

    const normalizedDistributorId = dto.distributorId?.trim() || null;
    const hasUserGeofence = this.hasCompleteUserGeofence(attendanceUser);

    if (!hasUserGeofence && !normalizedDistributorId) {
      throw new BadRequestException(
        'Distributor is required when user location is not configured',
      );
    }

    const distributor = normalizedDistributorId
      ? await this.assertDistributor(tenantDb, normalizedDistributorId)
      : null;

    const existingToday = await this.findTodayAttendance(
      tenantDb,
      user.userId,
      normalizedDistributorId,
    );

    if (existingToday) {
      if (!existingToday.checkOutTime) {
        throw new BadRequestException(
          normalizedDistributorId
            ? 'Already checked in for this distributor today. Check out first.'
            : 'Already checked in today. Check out first.',
        );
      }
      throw new BadRequestException(
        normalizedDistributorId
          ? 'Attendance for this distributor is already completed today'
          : 'Attendance is already completed today',
      );
    }

    const geofence =
      hasUserGeofence && !distributor
        ? this.resolveUserGeofence(attendanceUser)
        : this.resolveAttendanceGeofence(attendanceUser, distributor!);
    this.assertWithinAttendanceArea(
      dto.checkInLatitude,
      dto.checkInLongitude,
      geofence,
    );

    const today = this.startOfDay(new Date());
    const now = new Date();
    const repo = tenantDb.getRepository(Attendence);
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
    dto: CheckOutAttendanceDto,
    user: { userId: string },
  ) {
    const normalizedDistributorId = dto.distributorId?.trim() || null;

    const repo = tenantDb.getRepository(Attendence);
    const attendance = normalizedDistributorId
      ? await this.findTodayAttendance(
          tenantDb,
          user.userId,
          normalizedDistributorId,
        )
      : await this.findActiveTodayAttendance(tenantDb, user.userId);

    if (!attendance) {
      throw new NotFoundException(
        normalizedDistributorId
          ? 'No check-in found for this distributor today'
          : 'No active check-in found for today',
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

  async getAppOverview(
    tenantDb: DataSource,
    filters: AppAttendanceOverviewDto,
    user: { userId: string },
  ) {
    const { year, month } = filters;
    const { start, end, daysInMonth } = this.getMonthDateRange(year, month);
    const working = this.countWorkableDaysInMonth(year, month);

    const attendanceRows = await tenantDb
      .getRepository(Attendence)
      .createQueryBuilder('a')
      .where('a."userId" = :userId', { userId: user.userId })
      .andWhere('a."attendenceDate" >= :start', { start })
      .andWhere('a."attendenceDate" <= :end', { end })
      .getMany();

    const byDate = new Map<string, Attendence[]>();
    for (const row of attendanceRows) {
      const dateKey = this.toDateKey(row.attendenceDate);
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(row);
    }

    let present = 0;
    let absent = 0;
    let leave = 0;
    const records: Array<{
      id: string | null;
      date: string;
      day: number;
      weekday: string;
      status: AttendanceRecordStatus;
      checkIn?: string;
      checkOut?: string;
      workingHours?: string;
      location?: string;
    }> = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const weekend = this.isWeekend(year, month, day);
      const isFuture = this.isFutureDay(year, month, day);
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayRecords = byDate.get(dateKey) ?? [];
      const code = this.resolveDayCode(dayRecords, weekend, isFuture);

      if (code === 'NA') {
        continue;
      }

      if (code === 'P' || code === 'HD') {
        present += 1;
      } else if (code === 'A') {
        absent += 1;
      } else if (code === 'L') {
        leave += 1;
      }

      const primaryRecord = this.pickPrimaryAttendanceRecord(dayRecords);
      const status = this.mapDayCodeToStatus(code);
      const record: (typeof records)[number] = {
        id: primaryRecord?.id ?? null,
        date: dateKey,
        day,
        weekday: this.weekdayLabel(year, month, day),
        status,
      };

      if ((code === 'P' || code === 'HD') && primaryRecord?.checkInTime) {
        record.checkIn = this.formatTime(primaryRecord.checkInTime);
        if (primaryRecord.checkOutTime) {
          record.checkOut = this.formatTime(primaryRecord.checkOutTime);
          record.workingHours = this.formatWorkingHours(
            primaryRecord.checkInTime,
            primaryRecord.checkOutTime,
          );
        }
        if (primaryRecord.checkInLocation?.trim()) {
          record.location = primaryRecord.checkInLocation.trim();
        }
      }

      records.push(record);
    }

    records.sort((left, right) => right.day - left.day);

    const attendanceRate =
      working > 0 ? Math.round((present / working) * 100) : 0;

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ATTENDANCE_APP_OVERVIEW_VIEWED',
      description: 'App attendance overview viewed',
      metadata: { year, month, present, absent, leave, working },
    });

    return {
      filters: { month, year },
      summary: {
        present,
        absent,
        leave,
        working,
        attendanceRate,
        message: this.resolveAttendanceMessage(attendanceRate),
      },
      records,
    };
  }

  async getOverview(
    tenantDb: DataSource,
    filters: AttendanceOverviewDto,
    user: { userId: string },
  ) {
    const { year, month } = filters;
    const { start, end, daysInMonth } = this.getMonthDateRange(year, month);
    const workableDays = this.countWorkableDaysInMonth(year, month);
    const elapsedWorkableDays = this.countElapsedWorkableDaysInMonth(year, month);

    const userQb = tenantDb
      .getRepository(User)
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.designation', 'designation')
      .where('u."isDeleted" = false')
      .andWhere('u."isActive" = true');

    if (filters.designationId) {
      userQb.andWhere('u."designationId" = :designationId', {
        designationId: filters.designationId,
      });
    }

    if (filters.userType) {
      userQb.andWhere('u.type = :userType', {
        userType: filters.userType as UserType,
      });
    }

    const search = filters.search?.trim();
    if (search) {
      userQb.andWhere('u.name ILIKE :search', { search: `%${search}%` });
    }

    const users = await userQb
      .select([
        'u.id',
        'u.name',
        'u.locationTitle',
        'u.type',
        'designation.id',
        'designation.name',
        'designation.slug',
      ])
      .orderBy('u.name', 'ASC')
      .getMany();

    const userIds = users.map((row) => row.id);
    const attendanceByUserAndDate = new Map<string, Map<string, Attendence[]>>();

    if (userIds.length) {
      const attendanceRows = await tenantDb
        .getRepository(Attendence)
        .createQueryBuilder('a')
        .where('a."userId" IN (:...userIds)', { userIds })
        .andWhere('a."attendenceDate" >= :start', { start })
        .andWhere('a."attendenceDate" <= :end', { end })
        .getMany();

      for (const row of attendanceRows) {
        const dateKey = this.toDateKey(row.attendenceDate);
        if (!attendanceByUserAndDate.has(row.userId)) {
          attendanceByUserAndDate.set(row.userId, new Map());
        }
        const byDate = attendanceByUserAndDate.get(row.userId)!;
        if (!byDate.has(dateKey)) {
          byDate.set(dateKey, []);
        }
        byDate.get(dateKey)!.push(row);
      }
    }

    let presentDays = 0;
    let absentDays = 0;
    let halfDays = 0;

    const employees = users.map((employee) => {
      const byDate = attendanceByUserAndDate.get(employee.id) ?? new Map();
      let employeePresent = 0;
      let employeeAbsent = 0;
      let employeeHalfDays = 0;
      let employeeLeave = 0;

      const days = Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const weekend = this.isWeekend(year, month, day);
        const isFuture = this.isFutureDay(year, month, day);
        const dayRecords = byDate.get(dateKey) ?? [];
        const primaryRecord = this.pickPrimaryAttendanceRecord(dayRecords);
        const code = this.resolveDayCode(dayRecords, weekend, isFuture);

        if (code === 'P') {
          presentDays += 1;
          employeePresent += 1;
        } else if (code === 'A') {
          absentDays += 1;
          employeeAbsent += 1;
        } else if (code === 'HD') {
          halfDays += 1;
          employeeHalfDays += 1;
        } else if (code === 'L') {
          employeeLeave += 1;
        }

        return {
          id: primaryRecord?.id ?? null,
          day,
          weekday: this.weekdayLabel(year, month, day),
          code,
        };
      });

      return {
        id: employee.id,
        name: employee.name,
        zone: employee.locationTitle,
        userType: employee.type,
        designation: employee.designation
          ? {
              id: employee.designation.id,
              name: employee.designation.name,
              slug: employee.designation.slug,
            }
          : null,
        days,
        summary: {
          present: employeePresent,
          absent: employeeAbsent,
          halfDays: employeeHalfDays,
          leave: employeeLeave,
        },
      };
    });

    const totalUsers = users.length;
    const expectedWorkSlots = totalUsers * elapsedWorkableDays;
    const attendanceRate =
      expectedWorkSlots > 0
        ? this.roundAttendanceRate((presentDays / expectedWorkSlots) * 100)
        : 0;

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ATTENDANCE_OVERVIEW_VIEWED',
      description: 'Attendance overview viewed',
      metadata: {
        year,
        month,
        designationId: filters.designationId ?? null,
        userType: filters.userType ?? null,
        totalUsers,
      },
    });

    return {
      filters: {
        year,
        month,
        designationId: filters.designationId ?? null,
        userType: filters.userType ?? null,
        search: search ?? null,
      },
      summary: {
        totalUsers,
        presentDays,
        absentDays,
        halfDays,
        attendanceRate,
      },
      meta: {
        daysInMonth,
        workableDays,
      },
      employees,
    };
  }
}
