import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Put,
} from '@nestjs/common';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import { TenantRoleService } from '../service/tenant-role.service';
import { CreateTenantRoleDto } from '../dto/role/create-tenant-role.dto';
import { UpdateTenantRoleDto } from '../dto/role/update-tenant-role.dto';

@Controller('tenant/roles')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class TenantRoleController {
  constructor(private readonly tenantRoleService: TenantRoleService) {}

  @Get()
  @RequirePermissions('LIST_ROLE')
  list(@TenantConnection() tenantDb: DataSource, @Query('page') page: number = 1, @Query('limit') limit: number = 10, @Query('search') search: string = '') {
    return this.tenantRoleService.listRoles(tenantDb, page, limit, search);
  }

  @Get(':id')
  @RequirePermissions('VIEW_ROLE')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
  ) {
    return this.tenantRoleService.getRoleById(tenantDb, id);
  }

  @Post('create')
  @RequirePermissions('CREATE_ROLE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateTenantRoleDto,
  ) {
    return this.tenantRoleService.createRole(tenantDb, dto);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_ROLE')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateTenantRoleDto,
  ) {
    return this.tenantRoleService.updateRole(tenantDb, id, dto);
  }
}
