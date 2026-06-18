import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckOutAttendanceDto {
  @Type(() => Number)
  @IsNumber()
  checkOutLatitude: number;

  @Type(() => Number)
  @IsNumber()
  checkOutLongitude: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkOutLocation?: string;
}
