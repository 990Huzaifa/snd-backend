import {
  Body,
  Controller,
  Get,
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
import { StockTransferService } from '../service/stock-transfer.service';
import { CreateStockTransferDto } from '../dto/stock-transfer/create-stock-transfer.dto';

@Controller('tenant/stock-transfers')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class StockTransferController {
  constructor(private readonly stockTransferService: StockTransferService) {}

  @Post('create')
  @RequirePermissions('CREATE_STOCK_TRANSFER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateStockTransferDto,
    @Req() req: Request,
  ) {
    return this.stockTransferService.create(tenantDb, dto, req.user as { userId: string });
  }

  @Get()
  @RequirePermissions('LIST_STOCK_TRANSFER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.stockTransferService.list(
      tenantDb,
      page,
      limit,
      search,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_STOCK_TRANSFER')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.stockTransferService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }

  @Get('stock-by-distributor/:distributorId')
  @RequirePermissions('VIEW_STOCK_TRANSFER')
  stockByDistributor(
    @TenantConnection() tenantDb: DataSource,
    @Param('distributorId') distributorId: string,
    ) {
    return this.stockTransferService.stockByDistributor(
      tenantDb,
      distributorId,
    );
  }
}
