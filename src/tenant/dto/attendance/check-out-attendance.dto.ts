import { Type } from 'class-transformer';
import {
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

export class CheckOutAttendanceDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  checkOutLatitude: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  checkOutLongitude: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkOutLocation?: string;

  /** Local wall-clock time, e.g. 2026-07-10T17:30:00 */
  @IsString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
    {
      message:
        'checkOutTime must be a local datetime like 2026-07-10T17:30:00',
    },
  )
  checkOutTime: string;

  /**
   * Device offset from Date.getTimezoneOffset() (minutes).
   * Pakistan UTC+5 → -300. Required for correct local→UTC when checkOutTime has no offset.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-840)
  @Max(840)
  timezoneOffsetMinutes?: number;
}
