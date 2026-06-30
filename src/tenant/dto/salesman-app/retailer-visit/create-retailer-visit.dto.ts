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

  @IsEnum(RetailerVisitStatus)
  visitStatus: RetailerVisitStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
