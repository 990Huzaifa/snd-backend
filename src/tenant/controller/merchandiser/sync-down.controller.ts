import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { SalesmanDistributorQueryDto } from '../../dto/salesman-app/sync-down/sync-down.dto';
import { MerchandiserSyncDownService } from '../../service/merchandiser-app/sync-down.service';

@Controller('tenant/merchandiser')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class MerchandiserSyncDownController {
  constructor(private readonly syncDownService: MerchandiserSyncDownService) {}

  @Get('assigned-distributors')
  @RequirePermissions('MERCHANDISER_SYNC_DOWN')
  listAssignedDistributors(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    return this.syncDownService.listAssignedDistributors(
      tenantDb,
      req.user as { userId: string },
    );
  }

  @Get('routes')
  @RequirePermissions('MERCHANDISER_SYNC_DOWN')
  listRoutes(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: SalesmanDistributorQueryDto,
  ) {
    return this.syncDownService.listRoutes(tenantDb, query.distributorId);
  }

  @Get('retailers')
  @RequirePermissions('MERCHANDISER_SYNC_DOWN')
  listRetailers(@TenantConnection() tenantDb: DataSource) {
    return this.syncDownService.listRetailers(tenantDb);
  }

  @Get('pjps')
  @RequirePermissions('MERCHANDISER_SYNC_DOWN')
  listPjps(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    return this.syncDownService.listPjps(
      tenantDb,
      req.user as { userId: string },
    );
  }

  @Get('retailer-categories')
  @RequirePermissions('MERCHANDISER_SYNC_DOWN')
  listRetailerCategories(@TenantConnection() tenantDb: DataSource) {
    return this.syncDownService.listRetailerCategories(tenantDb);
  }

  @Get('retailer-channels')
  @RequirePermissions('MERCHANDISER_SYNC_DOWN')
  listRetailerChannels(@TenantConnection() tenantDb: DataSource) {
    return this.syncDownService.listRetailerChannels(tenantDb);
  }
}
