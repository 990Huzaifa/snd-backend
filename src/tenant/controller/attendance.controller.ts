import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { AttendanceService } from '../service/attendance.service';
import { CheckInAttendanceDto } from '../dto/attendance/check-in-attendance.dto';
import { CheckOutAttendanceDto } from '../dto/attendance/check-out-attendance.dto';
import { ListAttendanceDto } from '../dto/attendance/list-attendance.dto';
import { CreateTrackingLogDto } from '../dto/attendance/create-tracking-log.dto';

@Controller('tenant/attendance')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @RequirePermissions('CHECK_IN_ATTENDANCE')
  checkIn(
    @TenantConnection() tenantDb: DataSource,
    @Query('distributorId') distributorId: string,
    @Body() dto: CheckInAttendanceDto,
    @Req() req: Request,
  ) {
    return this.attendanceService.checkIn(
      tenantDb,
      distributorId,
      dto,
      req.user as { userId: string },
    );
  }

  @Post('check-out')
  @RequirePermissions('CHECK_OUT_ATTENDANCE')
  checkOut(
    @TenantConnection() tenantDb: DataSource,
    @Query('distributorId') distributorId: string,
    @Body() dto: CheckOutAttendanceDto,
    @Req() req: Request,
  ) {
    return this.attendanceService.checkOut(
      tenantDb,
      distributorId,
      dto,
      req.user as { userId: string },
    );
  }

  @Get()
  @RequirePermissions('LIST_ATTENDANCE')
  listHistory(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: ListAttendanceDto,
    @Req() req: Request,
  ) {
    return this.attendanceService.listHistory(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_ATTENDANCE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.attendanceService.viewAttendance(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }

  @Get(':id/tracking-logs')
  @RequirePermissions('VIEW_ATTENDANCE')
  getTrackingLogs(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.attendanceService.getTrackingLogs(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }

  @Post(':id/tracking-logs')
  @RequirePermissions('CHECK_IN_ATTENDANCE')
  addTrackingLog(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: CreateTrackingLogDto,
    @Req() req: Request,
  ) {
    return this.attendanceService.addTrackingLog(
      tenantDb,
      id,
      dto,
      req.user as { userId: string },
    );
  }
}
