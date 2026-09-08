import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Admin-markable statuses for dashboard. */
export enum MarkAttendanceStatus {
  LEAVE = 'LEAVE',
  PRESENT = 'PRESENT',
}

export class MarkAttendanceDto {
  @IsUUID()
  userId: string;

  /** Attendance day in YYYY-MM-DD */
  @IsDateString()
  attendanceDate: string;

  @IsEnum(MarkAttendanceStatus)
  status: MarkAttendanceStatus;

  /**
   * Required for PRESENT.
   * Accepts full datetime or time-only (e.g. 09:00, 09:00 AM).
   */
  @ValidateIf(
    (o: MarkAttendanceDto) => o.status === MarkAttendanceStatus.PRESENT,
  )
  @IsString()
  checkInTime?: string;

  /**
   * Required for PRESENT.
   * Accepts full datetime or time-only (e.g. 18:00, 06:00 PM).
   */
  @ValidateIf(
    (o: MarkAttendanceDto) => o.status === MarkAttendanceStatus.PRESENT,
  )
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkInLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkOutLocation?: string;
}
