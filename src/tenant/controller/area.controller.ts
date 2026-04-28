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
import { AreaService } from '../service/area.service';
import { CreateAreaDto } from '../dto/area/create-area.dto';
import { UpdateAreaDto } from '../dto/area/update-area.dto';

@Controller('tenant/areas')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Post('create')
  @RequirePermissions('CREATE_AREA')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateAreaDto,
    @Req() req: Request,
  ) {
    return this.areaService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_AREA')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
    @Query('regionId') regionId?: string,
  ) {
    return this.areaService.list(
      tenantDb,
      page,
      limit,
      search,
      regionId,
      req.user,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_AREA')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.areaService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_AREA')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateAreaDto,
    @Req() req: Request,
  ) {
    return this.areaService.edit(tenantDb, id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_AREA')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.areaService.delete(tenantDb, id, req.user);
  }
}
