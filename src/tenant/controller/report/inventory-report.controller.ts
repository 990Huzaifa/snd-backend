import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { InventoryMovementDto } from '../../dto/report/inventory-movement.dto';
import { InventoryOverviewDto } from '../../dto/report/inventory-overview.dto';
import { InventoryReportService } from '../../service/report/inventory-report.service';

@Controller('tenant/reports/inventory')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class InventoryReportController {
  constructor(private readonly inventoryReportService: InventoryReportService) {}

  @Get('overview')
  @RequirePermissions('VIEW_INVENTORY_REPORT')
  overview(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: InventoryOverviewDto,
    @Req() req: Request,
  ) {
    return this.inventoryReportService.getOverview(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get('movement')
  @RequirePermissions('VIEW_INVENTORY_REPORT')
  movement(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: InventoryMovementDto,
    @Req() req: Request,
  ) {
    return this.inventoryReportService.getMovement(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }
}
