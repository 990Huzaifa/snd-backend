import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AttendenceStatus } from 'src/tenant-db/entities/attendence.entity';

export class CheckInAttendanceDto {
  @IsUUID()
  distributorId: string;

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

  @IsOptional()
  @IsEnum(AttendenceStatus)
  status?: AttendenceStatus;
}
