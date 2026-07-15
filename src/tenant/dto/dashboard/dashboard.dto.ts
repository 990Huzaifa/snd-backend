import { IsDateString, IsOptional, IsUUID } from 'class-validator';

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
