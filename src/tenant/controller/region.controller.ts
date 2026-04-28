import {
  Body,
  Controller,
  Delete,
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
import { RegionService } from '../service/region.service';
import { CreateRegionDto } from '../dto/region/create-region.dto';
import { UpdateRegionDto } from '../dto/region/update-region.dto';

@Controller('tenant/regions')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class RegionController {
  constructor(private readonly regionService: RegionService) {}

  @Post('create')
  @RequirePermissions('CREATE_REGION')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateRegionDto,
    @Req() req: Request,
  ) {
    return this.regionService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_REGION')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
    @Query('cityId') cityId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.regionService.list(
      tenantDb,
      page,
      limit,
      search,
      cityId,
      isActive,
      req.user,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_REGION')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.regionService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_REGION')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateRegionDto,
    @Req() req: Request,
  ) {
    return this.regionService.edit(tenantDb, id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_REGION')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.regionService.delete(tenantDb, id, req.user);
  }
}
