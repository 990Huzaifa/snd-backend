import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode, TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { BulkTransferRetailerRouteDto } from '../dto/retailer/bulk-transfer-retailer-route.dto';
import { RetailerRouteTransferService } from '../service/retailer/retailer-route-transfer.service';

@Controller('tenant/retailers/route-transfers')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class RetailerRouteTransferController {
  constructor(private readonly retailerRouteTransferService: RetailerRouteTransferService) {}

  @Post('create')
  @RequirePermissions('TRANSFER_RETAILER_ROUTE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: BulkTransferRetailerRouteDto,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    return this.retailerRouteTransferService.create(
      tenantDb,
      dto,
      req.user as { userId: string },
      tenantCode,
    );
  }

  @Get()
  @RequirePermissions('LIST_RETAILER')
  list(
    @TenantCode() tenantCode: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string,
  ) {
    return this.retailerRouteTransferService.list(tenantCode, page, limit, status);
  }

  @Get(':id')
  @RequirePermissions('VIEW_RETAILER')
  view(
    @TenantCode() tenantCode: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.retailerRouteTransferService.view(
      tenantCode,
      id,
      req.user as { userId: string },
    );
  }
}
