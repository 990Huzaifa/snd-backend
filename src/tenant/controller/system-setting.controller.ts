import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { SystemSettingService } from '../service/system-setting.service';
import { UpdateSystemSettingDto } from '../dto/system-setting/update-system-setting.dto';

@Controller('tenant/system-settings')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SystemSettingController {
  constructor(private readonly systemSettingService: SystemSettingService) {}

  @Get()
  @RequirePermissions('VIEW_SYSTEM_SETTING')
  get(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
    return this.systemSettingService.get(tenantDb, req.user);
  }

  @Put()
  @RequirePermissions('UPDATE_SYSTEM_SETTING')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: UpdateSystemSettingDto,
    @Req() req: Request,
  ) {
    return this.systemSettingService.update(tenantDb, dto, req.user);
  }
}
