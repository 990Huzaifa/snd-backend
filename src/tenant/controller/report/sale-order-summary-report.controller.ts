import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { SaleOrderSummaryReportDto } from '../../dto/report/sale-order-summary-report.dto';
import { SaleOrderSummaryReportService } from '../../service/report/sale-order-summary-report.service';

@Controller('tenant/reports/sale-order-summary')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SaleOrderSummaryReportController {
  constructor(
    private readonly saleOrderSummaryReportService: SaleOrderSummaryReportService,
  ) {}

  @Get('overview')
  @RequirePermissions('VIEW_SALE_ORDER_SUMMARY_REPORT')
  overview(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: SaleOrderSummaryReportDto,
    @Req() req: Request,
  ) {
    return this.saleOrderSummaryReportService.getOverview(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }
}
