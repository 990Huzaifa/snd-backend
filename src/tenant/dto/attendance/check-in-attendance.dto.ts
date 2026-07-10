import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { AttendenceStatus } from 'src/tenant-db/entities/attendence.entity';

export class CheckInAttendanceDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  checkInLatitude: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  checkInLongitude: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkInLocation?: string;

  /** Local wall-clock time, e.g. 2026-07-10T09:00:00 */
  @IsOptional()
  @IsString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
    {
      message:
        'checkInTime must be a local datetime like 2026-07-10T09:00:00',
    },
  )
  checkInTime?: string;

  /**
   * Device offset from Date.getTimezoneOffset() (minutes).
   * Pakistan UTC+5 → -300. Required for correct local→UTC when checkInTime has no offset.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-840)
  @Max(840)
  timezoneOffsetMinutes?: number;

  @IsOptional()
  @IsEnum(AttendenceStatus)
  status?: AttendenceStatus;
}
