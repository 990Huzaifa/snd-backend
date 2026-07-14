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

export enum RetailerMerchandisingReportType {
  DAY_WISE = 'DAY_WISE',
  MERCHANDISER_WISE = 'MERCHANDISER_WISE',
  ROUTE_WISE = 'ROUTE_WISE',
}

export class RetailerMerchandisingReportDto {
  @IsOptional()
  @IsEnum(RetailerMerchandisingReportType)
  reportType?: RetailerMerchandisingReportType;

  @IsOptional()
  @IsUUID()
  merchandiserId?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

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
