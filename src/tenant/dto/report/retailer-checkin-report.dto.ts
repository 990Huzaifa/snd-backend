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

export enum RetailerCheckInReportType {
  DAY_WISE = 'DAY_WISE',
  SALESMAN_WISE = 'SALESMAN_WISE',
  ROUTE_WISE = 'ROUTE_WISE',
  RETAILER_WISE = 'RETAILER_WISE',
}

export class RetailerCheckInReportDto {
  @IsOptional()
  @IsEnum(RetailerCheckInReportType)
  reportType?: RetailerCheckInReportType;

  @IsOptional()
  @IsUUID()
  salesmanId?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

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
