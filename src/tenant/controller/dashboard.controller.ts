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
  DashboardAttendanceQueryDto,
  DashboardOrdersQueryDto,
  DashboardOverviewQueryDto,
  DashboardSalesQueryDto,
} from '../dto/dashboard/dashboard.dto';
import { DashboardService } from '../service/dashboard.service';

@Controller('tenant/dashboard')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @RequirePermissions('VIEW_DASHBOARD')
  overview(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: DashboardOverviewQueryDto,
    @Req() req: Request,
  ) {
    return this.dashboardService.getOverview(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get('mtd-sales')
  @RequirePermissions('VIEW_DASHBOARD')
  mtdSales(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: DashboardSalesQueryDto,
    @Req() req: Request,
  ) {
    return this.dashboardService.getMtdSales(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get('ytd-sales')
  @RequirePermissions('VIEW_DASHBOARD')
  ytdSales(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: DashboardSalesQueryDto,
    @Req() req: Request,
  ) {
    return this.dashboardService.getYtdSales(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get('orders-fulfillment')
  @RequirePermissions('VIEW_DASHBOARD')
  ordersFulfillment(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: DashboardOrdersQueryDto,
    @Req() req: Request,
  ) {
    return this.dashboardService.getOrdersFulfillment(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get('attendance')
  @RequirePermissions('VIEW_DASHBOARD')
  attendance(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: DashboardAttendanceQueryDto,
    @Req() req: Request,
  ) {
    return this.dashboardService.getAttendanceLive(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }
}
