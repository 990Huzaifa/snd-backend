import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { ProductPricingJobService } from '../service/product-pricing-job.service';
import { CreateProductPricingJobDto } from '../dto/product-pricing-job/create-product-pricing-job.dto';

@Controller('tenant/product-pricing-jobs')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class ProductPricingJobController {
  constructor(private readonly productPricingJobService: ProductPricingJobService) {}

  @Post('create')
  @RequirePermissions('UPDATE_PRODUCT_PRICING')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateProductPricingJobDto,
    @Req() req: Request,
  ) {
    return this.productPricingJobService.create(tenantDb, dto, req.user as { userId: string });
  }

  @Get()
  @RequirePermissions('LIST_PRODUCT')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Query('status') status?: string,
  ) {
    return this.productPricingJobService.list(tenantDb, page, limit, search, status);
  }
}
