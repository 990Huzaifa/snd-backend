import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { RetailerVisitStatus } from 'src/tenant-db/entities/retailer.entity';

export class CreateRetailerVisitDto {
  @IsUUID()
  retailerId: string;

  @Type(() => Number)
  @IsNumber()
  checkInLatitude: number;

  @Type(() => Number)
  @IsNumber()
  checkInLongitude: number;

  @IsEnum(RetailerVisitStatus)
  visitStatus: RetailerVisitStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
