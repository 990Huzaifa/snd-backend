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
import { DistributorService } from '../service/distributor.service';
import { CreateDistributorDto } from '../dto/distributor/create-distributor.dto';
import { UpdateDistributorDto } from '../dto/distributor/update-distributor.dto';

@Controller('tenant/distributors')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class DistributorController {
  constructor(private readonly distributorService: DistributorService) {}

  @Post('create')
  @RequirePermissions('CREATE_DISTRIBUTOR')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateDistributorDto,
    @Req() req: Request,
  ) {
    return this.distributorService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_DISTRIBUTOR')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
    @Query('areaId') areaId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.distributorService.list(
      tenantDb,
      page,
      limit,
      search,
      areaId,
      isActive,
      req.user,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_DISTRIBUTOR')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.distributorService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_DISTRIBUTOR')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateDistributorDto,
    @Req() req: Request,
  ) {
    return this.distributorService.edit(tenantDb, id, dto, req.user);
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_DISTRIBUTOR')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Query('status') status: boolean,
    @Req() req: Request,
  ) {
    return this.distributorService.updateStatus(tenantDb, id, status, req.user);
  }
}
