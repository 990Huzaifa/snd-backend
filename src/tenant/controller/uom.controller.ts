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
import { UomService } from '../service/uom.service';
import { CreateUomDto } from '../dto/uom/create-uom.dto';
import { UpdateUomDto } from '../dto/uom/update-uom.dto';

@Controller('tenant/uoms')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class UomController {
  constructor(private readonly uomService: UomService) {}

  @Post('create')
  @RequirePermissions('CREATE_UOM')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateUomDto,
    @Req() req: Request,
  ) {
    return this.uomService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_UOM')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.uomService.list(tenantDb, page, limit, search, req.user);
  }

  @Get(':id')
  @RequirePermissions('VIEW_UOM')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.uomService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_UOM')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateUomDto,
    @Req() req: Request,
  ) {
    return this.uomService.edit(tenantDb, id, dto, req.user);
  }
}
