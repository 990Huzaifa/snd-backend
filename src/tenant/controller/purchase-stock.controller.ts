import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { PurchaseStockService } from '../service/purchase-stock.service';
import { CreatePurchaseStockDto } from '../dto/purchase-stock/create-purchase-stock.dto';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Controller('tenant/purchase-stocks')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class PurchaseStockController {
  constructor(private readonly purchaseStockService: PurchaseStockService) {}

  @Post('create')
  @RequirePermissions('CREATE_PURCHASE_STOCK')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePurchaseStockDto,
    @Req() req: Request,
  ) {
    return this.purchaseStockService.create(tenantDb, dto, req.user as { userId: string });
  }

  @Get()
  @RequirePermissions('LIST_PURCHASE_STOCK')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.purchaseStockService.list(
      tenantDb,
      page,
      limit,
      search,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_STOCK')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.purchaseStockService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
}
