import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { SalesmanTrackingReportDto } from '../../dto/report/salesman-tracking-report.dto';
import { SalesmanTrackingReportService } from '../../service/report/salesman-tracking-report.service';

@Controller('tenant/reports/salesman-tracking')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SalesmanTrackingReportController {
  constructor(
    private readonly salesmanTrackingReportService: SalesmanTrackingReportService,
  ) {}

  @Get('day')
  @RequirePermissions('VIEW_SALESMAN_TRACKING_REPORT')
  getDay(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: SalesmanTrackingReportDto,
    @Req() req: Request,
  ) {
    return this.salesmanTrackingReportService.getDayTracking(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }
}
