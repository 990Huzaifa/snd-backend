import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum InventoryForecastInsightType {
  HIGH_DEMAND = 'HIGH_DEMAND',
  SLOW_MOVING = 'SLOW_MOVING',
  BELOW_MINIMUM = 'BELOW_MINIMUM',
  UPDATE_STOCK_LEVELS = 'UPDATE_STOCK_LEVELS',
  OVERSTOCK = 'OVERSTOCK',
  STOCKOUT_RISK = 'STOCKOUT_RISK',
}

export class InventoryForecastOverviewDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  analysisDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  forecastDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  slowMovingDaysCover?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.1)
  @Max(10)
  safetyFactor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  leadDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  categoryLimit?: number;
}

export class InventoryForecastInsightsDto extends InventoryForecastOverviewDto {
  @IsEnum(InventoryForecastInsightType)
  type: InventoryForecastInsightType;

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
