import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
import { SaleVoucherService } from '../service/sale-voucher.service';
import { CreateSaleVoucherDto } from '../dto/sale-voucher/create-sale-voucher.dto';
import { UpdateSaleVoucherDto } from '../dto/sale-voucher/update-sale-voucher.dto';
import { UpdateSaleVoucherStatusDto } from '../dto/sale-voucher/update-sale-voucher-status.dto';

@Controller('tenant/sale-vouchers')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SaleVoucherController {
  constructor(private readonly saleVoucherService: SaleVoucherService) {}

  @Get()
  @RequirePermissions('LIST_SALE_VOUCHER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('retailerIds') retailerIds?: string,
    @Query('shopName') shopName?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.saleVoucherService.list(
      tenantDb,
      page,
      limit,
      { retailerIds, shopName, dateFrom, dateTo, status },
      req.user as { userId: string },
    );
  }

  @Post('create')
  @RequirePermissions('CREATE_SALE_VOUCHER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleVoucherDto,
    @Req() req: Request,
  ) {
    return this.saleVoucherService.create(
      tenantDb,
      dto,
      req.user as { userId: string },
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_VOUCHER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateSaleVoucherDto,
    @Req() req: Request,
  ) {
    return this.saleVoucherService.edit(
      tenantDb,
      id,
      dto,
      req.user as { userId: string },
    );
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_SALE_VOUCHER')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateSaleVoucherStatusDto,
    @Req() req: Request,
  ) {
    return this.saleVoucherService.updateStatus(
      tenantDb,
      id,
      dto,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_VOUCHER')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.saleVoucherService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
}
