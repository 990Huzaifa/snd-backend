import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { RetailerMerchandisingReportDto } from '../../dto/report/retailer-merchandising-report.dto';
import { RetailerMerchandisingReportService } from '../../service/report/retailer-merchandising-report.service';

@Controller('tenant/reports/retailer-merchandising')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class RetailerMerchandisingReportController {
  constructor(
    private readonly retailerMerchandisingReportService: RetailerMerchandisingReportService,
  ) {}

  @Get('overview')
  @RequirePermissions('VIEW_RETAILER_MERCHANDISING_REPORT')
  overview(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: RetailerMerchandisingReportDto,
    @Req() req: Request,
  ) {
    return this.retailerMerchandisingReportService.getOverview(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_RETAILER_MERCHANDISING_REPORT')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.retailerMerchandisingReportService.getMerchandisingDetail(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
}
