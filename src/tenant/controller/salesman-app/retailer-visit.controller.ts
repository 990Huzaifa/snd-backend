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
import { FileFieldsInterceptor } from '@nestjs/platform-express';
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
import {
  salesmanVisitImageMulterOptions,
  SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD,
} from '../../config/salesman-visit-image.multer';
import { CreateRetailerVisitDto } from '../../dto/salesman-app/retailer-visit/create-retailer-visit.dto';
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
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'shopImages', maxCount: SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD },
        { name: 'shelfImages', maxCount: SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD },
      ],
      salesmanVisitImageMulterOptions,
    ),
  )
  create(
    @TenantConnection() tenantDb: DataSource,
    @TenantCode() tenantCode: string,
    @Body() dto: CreateRetailerVisitDto,
    @UploadedFiles()
    files: {
      shopImages?: Express.Multer.File[];
      shelfImages?: Express.Multer.File[];
    },
    @Req() req: Request,
  ) {
    return this.retailerVisitService.createVisit(
      tenantDb,
      tenantCode,
      dto,
      files,
      req.user as { userId: string },
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
