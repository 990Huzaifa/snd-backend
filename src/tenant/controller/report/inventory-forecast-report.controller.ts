import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import {
  InventoryForecastInsightsDto,
  InventoryForecastOverviewDto,
} from '../../dto/report/inventory-forecast.dto';
import { InventoryForecastReportService } from '../../service/report/inventory-forecast-report.service';

@Controller('tenant/reports/inventory-forecast')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class InventoryForecastReportController {
  constructor(
    private readonly inventoryForecastReportService: InventoryForecastReportService,
  ) {}

  @Get('overview')
  @RequirePermissions('VIEW_INVENTORY_FORECAST_REPORT')
  overview(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: InventoryForecastOverviewDto,
    @Req() req: Request,
  ) {
    return this.inventoryForecastReportService.getOverview(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get('insights')
  @RequirePermissions('VIEW_INVENTORY_FORECAST_REPORT')
  insights(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: InventoryForecastInsightsDto,
    @Req() req: Request,
  ) {
    return this.inventoryForecastReportService.getInsights(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }
}
