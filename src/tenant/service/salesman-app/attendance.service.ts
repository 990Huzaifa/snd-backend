import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Attendence,
  AttendenceStatus,
} from 'src/tenant-db/entities/attendence.entity';
import { ActivityLogService } from '../activity-log.service';
import { SalesmanAttendanceHistoryDto } from '../../dto/salesman-app/attendance/salesman-attendance-history.dto';

type AttendanceDayCode = 'P' | 'A' | 'HD' | 'L' | 'W' | 'NA';

type AttendanceRecordStatus =
  | 'present'
  | 'absent'
  | 'leave'
  | 'weekend'
  | 'future';

@Injectable()
export class SalesmanAttendanceService {
  constructor(private readonly activityLogService: ActivityLogService) {}

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

  private isFutureDay(year: number, month: number, day: number): boolean {
    const today = this.startOfDay(new Date());
    const target = this.startOfDay(new Date(year, month - 1, day));
    return target > today;
  }

  private toDateKey(date: Date): string {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
        (right.checkInTime?.getTime() ?? 0) -
        (left.checkInTime?.getTime() ?? 0),
    )[0];
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

  async getHistory(
    tenantDb: DataSource,
    filters: SalesmanAttendanceHistoryDto,
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

      if (
        (code === 'P' || code === 'HD') &&
        primaryRecord?.checkInTime
      ) {
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
      action: 'ATTENDANCE_HISTORY_VIEWED',
      description: 'Salesman attendance history viewed',
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


  // testing delete api service

  async deleteAttendance(tenantDb: DataSource, userId: string) {
    await tenantDb.getRepository(Attendence).delete({ "userId": userId });
    return { success: true };
  }
}
