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
import { RouteService } from '../service/route.service';
import { CreateRouteDto } from '../dto/route/create-route.dto';
import { UpdateRouteDto } from '../dto/route/update-route.dto';

@Controller('tenant/routes')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Post('create')
  @RequirePermissions('CREATE_ROUTE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateRouteDto,
    @Req() req: Request,
  ) {
    return this.routeService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_ROUTE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
    @Query('areaId') areaId?: string,
    @Query('distributorId') distributorId?: string,
  ) {
    return this.routeService.list(
      tenantDb,
      page,
      limit,
      search,
      areaId,
      distributorId,
      req.user,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_ROUTE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.routeService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_ROUTE')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
    @Req() req: Request,
  ) {
    return this.routeService.edit(tenantDb, id, dto, req.user);
  }
}
