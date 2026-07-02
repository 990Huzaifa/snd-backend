import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { RetailerVisitStatus } from 'src/tenant-db/entities/retailer.entity';

export enum RetailerVisitReportType {
  DAY_WISE = 'DAY_WISE',
  SALESMAN_WISE = 'SALESMAN_WISE',
  ROUTE_WISE = 'ROUTE_WISE',
  STATUS_WISE = 'STATUS_WISE',
}

export class RetailerVisitReportDto {
  @IsOptional()
  @IsEnum(RetailerVisitReportType)
  reportType?: RetailerVisitReportType;

  @IsOptional()
  @IsUUID()
  salesmanId?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsEnum(RetailerVisitStatus)
  status?: RetailerVisitStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
