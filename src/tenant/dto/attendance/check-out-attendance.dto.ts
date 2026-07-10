import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

  /** Local wall-clock time. Converted to UTC on the server. */
  @IsOptional()
  @IsString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
    {
      message:
        'checkOutTime must be a local datetime like 2026-07-10T17:30:00',
    },
  )
  checkOutTime?: string;
}
