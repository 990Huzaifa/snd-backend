import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

  /** Local wall-clock time. Converted to UTC on the server. */
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

  @IsOptional()
  @IsEnum(AttendenceStatus)
  status?: AttendenceStatus;
}
