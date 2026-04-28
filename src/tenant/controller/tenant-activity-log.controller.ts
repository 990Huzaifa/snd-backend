import { Controller, Get, Param, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import { ActivityLogService } from '../service/activity-log.service';

type TenantRequestUser = {
  userId?: string;
};

@Controller('tenant/activity-logs')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard, TenantPermissionGuard)
export class TenantActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private getUserId(req: Request): string {
    const user = req.user as TenantRequestUser;
    if (!user?.userId) {
      throw new UnauthorizedException('Tenant user not found in request');
    }
    return user.userId;
  }

  @Get('')
  @RequirePermissions('LIST_ACTIVITY_LOG')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    this.getUserId(req);
    return this.activityLogService.listActivityLogs(tenantDb, Number(page), Number(limit));
  }

  @Get(':id')
  @RequirePermissions('VIEW_ACTIVITY_LOG')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    this.getUserId(req);
    return this.activityLogService.viewActivityLog(tenantDb, id);
  }
}
