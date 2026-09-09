import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { ProductSalesReportDto } from '../../dto/report/product-sales-report.dto';
import { ProductSalesReportService } from '../../service/report/product-sales-report.service';

@Controller('tenant/reports/product-sales')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class ProductSalesReportController {
  constructor(
    private readonly productSalesReportService: ProductSalesReportService,
  ) {}

  @Get('overview')
  @RequirePermissions('VIEW_PRODUCT_SALES_REPORT')
  overview(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: ProductSalesReportDto,
    @Req() req: Request,
  ) {
    return this.productSalesReportService.getOverview(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }
}
