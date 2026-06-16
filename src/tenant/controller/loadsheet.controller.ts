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
import { LoadsheetService } from '../service/loadsheet.service';
import { CreateLoadSheetDto } from '../dto/loadsheet/create-loadsheet.dto';
import { UpdateLoadSheetDto } from '../dto/loadsheet/update-loadsheet.dto';
import { UpdateLoadSheetStatusDto } from '../dto/loadsheet/update-loadsheet-status.dto';
import { ListLoadSheetDto } from '../dto/loadsheet/list-loadsheet.dto';

@Controller('tenant/loadsheets')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class LoadsheetController {
  constructor(private readonly loadsheetService: LoadsheetService) {}

  @Get()
  @RequirePermissions('LIST_LOADSHEET')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: ListLoadSheetDto,
    @Req() req: Request,
  ) {
    return this.loadsheetService.list(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Post('create')
  @RequirePermissions('CREATE_LOADSHEET')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateLoadSheetDto,
    @Req() req: Request,
  ) {
    return this.loadsheetService.create(
      tenantDb,
      dto,
      req.user as { userId: string },
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_LOADSHEET')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateLoadSheetDto,
    @Req() req: Request,
  ) {
    return this.loadsheetService.edit(
      tenantDb,
      id,
      dto,
      req.user as { userId: string },
    );
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_LOADSHEET_STATUS')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateLoadSheetStatusDto,
    @Req() req: Request,
  ) {
    return this.loadsheetService.updateStatus(
      tenantDb,
      id,
      dto,
      req.user as { userId: string },
    );
  }

  @Get(':id/print-data')
  @RequirePermissions('PRINT_LOADSHEET')
  printData(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.loadsheetService.printData(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_LOADSHEET')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.loadsheetService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
}
