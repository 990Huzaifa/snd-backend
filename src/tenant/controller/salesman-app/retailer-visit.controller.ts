import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import {
  TenantCode,
  TenantConnection,
} from 'src/common/tenant/tenant-connection.decorator';
import { salesmanBulkVisitImageMulterOptions } from '../../config/salesman-visit-image.multer';
import { BulkCheckInRetailerDto } from '../../dto/salesman-app/retailer-visit/check-in-retailer.dto';
import { BulkCreateRetailerVisitDto } from '../../dto/salesman-app/retailer-visit/create-retailer-visit.dto';
import { ListRetailerVisitDto } from '../../dto/salesman-app/retailer-visit/list-retailer-visit.dto';
import { RetailerVisitService } from '../../service/salesman-app/retailer-visit.service';

@Controller('tenant/salesman/retailer-visits')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SalesmanRetailerVisitController {
  constructor(private readonly retailerVisitService: RetailerVisitService) {}

  @Post('create')
  @RequirePermissions('CREATE_RETAILER_VISIT')
  @UseInterceptors(AnyFilesInterceptor(salesmanBulkVisitImageMulterOptions))
  bulkCreate(
    @TenantConnection() tenantDb: DataSource,
    @TenantCode() tenantCode: string,
    @Body() dto: BulkCreateRetailerVisitDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    return this.retailerVisitService.bulkCreateVisits(
      tenantDb,
      tenantCode,
      dto,
      files,
      req.user as { userId: string },
    );
  }

  @Post('check-in')
  @RequirePermissions('CREATE_RETAILER_VISIT')
  bulkCheckIn(
    @TenantConnection() tenantDb: DataSource,
    @TenantCode() tenantCode: string,
    @Body() dto: BulkCheckInRetailerDto,
    @Req() req: Request,
  ) {
    return this.retailerVisitService.bulkCheckInRetailers(
      tenantDb,
      dto,
      req.user as { userId: string },
      tenantCode,
    );
  }

  @Get()
  @RequirePermissions('LIST_RETAILER_VISIT')
  listHistory(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: ListRetailerVisitDto,
    @Req() req: Request,
  ) {
    return this.retailerVisitService.listHistory(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_RETAILER_VISIT')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.retailerVisitService.viewVisit(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
}
