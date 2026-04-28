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
import { FlavourService } from '../service/flavour.service';
import { CreateFlavourDto } from '../dto/flavour/create-flavour.dto';
import { UpdateFlavourDto } from '../dto/flavour/update-flavour.dto';

@Controller('tenant/flavours')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class FlavourController {
  constructor(private readonly flavourService: FlavourService) {}

  @Post('create')
  @RequirePermissions('CREATE_FLAVOUR')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateFlavourDto,
    @Req() req: Request,
  ) {
    return this.flavourService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_FLAVOUR')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.flavourService.list(tenantDb, page, limit, search, req.user);
  }

  @Get(':id')
  @RequirePermissions('VIEW_FLAVOUR')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.flavourService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_FLAVOUR')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateFlavourDto,
    @Req() req: Request,
  ) {
    return this.flavourService.edit(tenantDb, id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_FLAVOUR')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.flavourService.delete(tenantDb, id, req.user);
  }
}
