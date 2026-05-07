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
import {
  TenantCode,
  TenantConnection,
} from 'src/common/tenant/tenant-connection.decorator';
import { RetailerService } from '../service/retailer.service';
import { CreateRetailerDto } from '../dto/retailer/create-retailer.dto';
import { UpdateRetailerDto } from '../dto/retailer/update-retailer.dto';
import { UpdateRetailerStatusDto } from '../dto/retailer/update-retailer-status.dto';

@Controller('tenant/retailers')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class RetailerController {
  constructor(private readonly retailerService: RetailerService) {}

  @Post('create')
  @RequirePermissions('CREATE_RETAILER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateRetailerDto,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    return this.retailerService.create(tenantDb, tenantCode, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_RETAILER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
    @Query('routeId') routeId?: string,
    @Query('retailerCategoryId') retailerCategoryId?: string,
    @Query('retailerChannelId') retailerChannelId?: string,
    @Query('status') status?: string,
    @Query('class') retailerClass?: string,
    @Query('areaId') areaId?: string,
  ) {
    return this.retailerService.list(
      tenantDb,
      page,
      limit,
      search,
      routeId,
      retailerCategoryId,
      retailerChannelId,
      status,
      retailerClass,
      areaId,
      req.user,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_RETAILER')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.retailerService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_RETAILER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateRetailerDto,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    return this.retailerService.edit(tenantDb, tenantCode, id, dto, req.user);
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_RETAILER')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateRetailerStatusDto,
    @Req() req: Request,
  ) {
    return this.retailerService.updateStatus(tenantDb, id, dto.status, req.user);
  }


  @Get('ledger/:id')
  @RequirePermissions('VIEW_RETAILER')
  getLedger(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.retailerService.getLedger(tenantDb, id, req.user, startDate, endDate);
  }
}
