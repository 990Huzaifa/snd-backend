import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import { TenantRoleService } from '../service/tenant-role.service';
import { CreateTenantRoleDto } from '../dto/role/create-tenant-role.dto';
import { UpdateTenantRoleDto } from '../dto/role/update-tenant-role.dto';

@Controller('tenant/roles')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
export class TenantRoleController {
  constructor(private readonly tenantRoleService: TenantRoleService) {}

  @Get()
  list(@TenantConnection() tenantDb: DataSource) {
    return this.tenantRoleService.listRoles(tenantDb);
  }

  @Get(':id')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
  ) {
    return this.tenantRoleService.getRoleById(tenantDb, id);
  }

  @Post('create')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateTenantRoleDto,
  ) {
    return this.tenantRoleService.createRole(tenantDb, dto);
  }

  @Post('update/:id')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateTenantRoleDto,
  ) {
    return this.tenantRoleService.updateRole(tenantDb, id, dto);
  }
}
