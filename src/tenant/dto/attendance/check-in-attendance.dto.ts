import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AttendenceStatus } from 'src/tenant-db/entities/attendence.entity';

export class CheckInAttendanceDto {
  @Type(() => Number)
  @IsNumber()
  checkInLatitude: number;

  @Type(() => Number)
  @IsNumber()
  checkInLongitude: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkInLocation?: string;

  @IsOptional()
  @IsEnum(AttendenceStatus)
  status?: AttendenceStatus;
}
