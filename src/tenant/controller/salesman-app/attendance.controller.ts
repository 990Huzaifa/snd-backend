import { Controller, Delete, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { SalesmanAttendanceHistoryDto } from '../../dto/salesman-app/attendance/salesman-attendance-history.dto';
import { SalesmanAttendanceService } from '../../service/salesman-app/attendance.service';

@Controller('tenant/salesman/attendance')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SalesmanAttendanceController {
  constructor(
    private readonly salesmanAttendanceService: SalesmanAttendanceService,
  ) {}

  @Get('history')
  history(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: SalesmanAttendanceHistoryDto,
    @Req() req: Request,
  ) {
    return this.salesmanAttendanceService.getHistory(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Delete('delete')
  deleteAttendance(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: { userId: string },
  ) {
    return this.salesmanAttendanceService.deleteAttendance(tenantDb, query.userId);
  }
}
