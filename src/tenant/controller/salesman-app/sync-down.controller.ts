import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { SalesmanSyncDownDto } from '../../dto/salesman-app/sync-down/sync-down.dto';
import { SalesmanSyncDownService } from '../../service/salesman-app/sync-down.service';

@Controller('tenant/salesman/sync-down')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SalesmanSyncDownController {
  constructor(private readonly syncDownService: SalesmanSyncDownService) {}

  @Get()
  @RequirePermissions('SALESMAN_SYNC_DOWN')
  syncDown(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: SalesmanSyncDownDto,
    @Req() req: Request,
  ) {
    return this.syncDownService.syncDown(
      tenantDb,
      query.distributorId,
      req.user as { userId: string },
    );
  }

  @Get('stock-products')
  @RequirePermissions('SALESMAN_SYNC_DOWN')
  listStockProducts(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: SalesmanSyncDownDto,
  ) {
    return this.syncDownService.listStockProducts(tenantDb, query.distributorId);
  }

  @Get('schemes')
  @RequirePermissions('SALESMAN_SYNC_DOWN')
  listSchemes(@TenantConnection() tenantDb: DataSource) {
    return this.syncDownService.listSchemes(tenantDb);
  }

  @Get('routes')
  @RequirePermissions('SALESMAN_SYNC_DOWN')
  listRoutes(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: SalesmanSyncDownDto,
  ) {
    return this.syncDownService.listRoutes(tenantDb, query.distributorId);
  }

  @Get('retailers')
  @RequirePermissions('SALESMAN_SYNC_DOWN')
  listRetailers(@TenantConnection() tenantDb: DataSource) {
    return this.syncDownService.listRetailers(tenantDb);
  }

  @Get('pjps')
  @RequirePermissions('SALESMAN_SYNC_DOWN')
  listPjps(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    return this.syncDownService.listPjps(
      tenantDb,
      req.user as { userId: string },
    );
  }

  @Get('approved-sale-vouchers')
  @RequirePermissions('SALESMAN_SYNC_DOWN')
  listApprovedSaleVouchers(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    return this.syncDownService.listApprovedSaleVouchers(
      tenantDb,
      req.user as { userId: string },
    );
  }

  @Get('approved-sale-invoices')
  @RequirePermissions('SALESMAN_SYNC_DOWN')
  listApprovedSaleInvoices(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    return this.syncDownService.listApprovedSaleInvoices(
      tenantDb,
      req.user as { userId: string },
    );
  }
}
