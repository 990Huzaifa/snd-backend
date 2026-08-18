import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { RetailerInventoryQueryDto } from '../../dto/salesman-app/retailer-inventory/retailer-inventory-query.dto';
import { SpgSyncDownService } from '../../service/spg-app/sync-down.service';

@Controller('tenant/spg')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SpgSyncDownController {
  constructor(private readonly syncDownService: SpgSyncDownService) {}

  @Get('routes')
  @RequirePermissions('SPG_SYNC_DOWN')
  listRoutes(@TenantConnection() tenantDb: DataSource) {
    return this.syncDownService.listRoutes(tenantDb);
  }

  @Get('retailers')
  @RequirePermissions('SPG_SYNC_DOWN')
  listRetailers(@TenantConnection() tenantDb: DataSource) {
    return this.syncDownService.listRetailers(tenantDb);
  }

  @Get('pjps')
  @RequirePermissions('SPG_SYNC_DOWN')
  listPjps(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    return this.syncDownService.listPjps(
      tenantDb,
      req.user as { userId: string },
    );
  }

  @Get('retailer-inventories')
  @RequirePermissions('SPG_SYNC_DOWN')
  listRetailerInventories(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: RetailerInventoryQueryDto,
  ) {
    return this.syncDownService.listRetailerInventories(
      tenantDb,
      query.retailerId,
    );
  }

  @Get('active-products')
  @RequirePermissions('SPG_SYNC_DOWN')
  listActiveProducts(@TenantConnection() tenantDb: DataSource) {
    return this.syncDownService.listActiveProducts(tenantDb);
  }

  @Get('merchandising-history')
  @RequirePermissions('SPG_SYNC_DOWN')
  listMerchandisingHistory(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: RetailerInventoryQueryDto,
  ) {
    return this.syncDownService.listMerchandisingHistory(
      tenantDb,
      req.user as { userId: string },
      query.retailerId,
    );
  }
}
