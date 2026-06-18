import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CheckOutAttendanceDto {
  @IsUUID()
  distributorId: string;

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
}
