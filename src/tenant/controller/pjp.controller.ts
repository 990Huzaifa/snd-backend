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
import { PjpService } from '../service/pjp.service';
import { CreatePjpDto } from '../dto/pjp/create-pjp.dto';
import { UpdatePjpDto } from '../dto/pjp/update-pjp.dto';
import { AssignPjpDto } from '../dto/pjp/assign-pjp.dto';

@Controller('tenant/pjp')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class PjpController {
  constructor(private readonly pjpService: PjpService) {}

  @Post('create')
  @RequirePermissions('CREATE_PJP')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePjpDto,
    @Req() req: Request,
  ) {
    return this.pjpService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_PJP')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
    @Query('salesmanId') salesmanId?: string,
    @Query('status') status?: string,
  ) {
    return this.pjpService.list(
      tenantDb,
      page,
      limit,
      search,
      salesmanId,
      status,
      req.user,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PJP')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.pjpService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PJP')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdatePjpDto,
    @Req() req: Request,
  ) {
    return this.pjpService.edit(tenantDb, id, dto, req.user);
  }

  @Put('assign/:id')
  @RequirePermissions('UPDATE_PJP')
  assign(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: AssignPjpDto,
    @Req() req: Request,
  ) {
    return this.pjpService.assign(tenantDb, id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PJP')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.pjpService.delete(tenantDb, id, req.user);
  }
}
