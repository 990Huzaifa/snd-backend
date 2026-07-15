import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

export enum DashboardTargetAchievementGroupBy {
  CITY = 'CITY',
  AREA = 'AREA',
}

export class DashboardSalesQueryDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

  /** Anchor date (YYYY-MM-DD). Defaults to today. */
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class DashboardOrdersQueryDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

  /** Day to report (YYYY-MM-DD). Defaults to today. */
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class DashboardAttendanceQueryDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

  /** Day to report (YYYY-MM-DD). Defaults to today. */
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class DashboardOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class DashboardTargetAchievementQueryDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @IsDateString()
  dateFrom: string;

  @IsDateString()
  dateTo: string;

  @IsEnum(DashboardTargetAchievementGroupBy)
  groupBy: DashboardTargetAchievementGroupBy;

  /** Optional product category filter for achieved sales. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
