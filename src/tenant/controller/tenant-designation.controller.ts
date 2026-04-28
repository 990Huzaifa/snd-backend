import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import { CreateTenantDesignationDto } from '../dto/designation/create-tenant-designation.dto';
import { UpdateTenantDesignationDto } from '../dto/designation/update-tenant-designation.dto';
import { TenantDesignationService } from '../service/tenant-designation.service';

@Controller('tenant/designations')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class TenantDesignationController {
  constructor(
    private readonly tenantDesignationService: TenantDesignationService,
  ) {}

  @Get()
  @RequirePermissions('LIST_DESIGNATION')
  list(@TenantConnection() tenantDb: DataSource, @Query('page') page: number = 1, @Query('limit') limit: number = 10, @Query('search') search: string = '') {
    return this.tenantDesignationService.listDesignations(tenantDb, page, limit, search);
  }

  @Get(':id')
  @RequirePermissions('VIEW_DESIGNATION')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
  ) {
    return this.tenantDesignationService.getDesignationById(tenantDb, id);
  }

  @Post('create')
  @RequirePermissions('CREATE_DESIGNATION')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateTenantDesignationDto,
  ) {
    return this.tenantDesignationService.createDesignation(tenantDb, dto);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_DESIGNATION')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDesignationDto,
  ) {
    return this.tenantDesignationService.updateDesignation(tenantDb, id, dto);
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_DESIGNATION')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Query('status') status: boolean,
  ) {
    return this.tenantDesignationService.updateDesignationStatus(tenantDb, id, status);
  }
}
