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
import { SaleInvoiceService } from '../service/sale-invoice.service';
import { CreateSaleInvoiceDto } from '../dto/sale-invoice/create-sale-invoice.dto';
import { UpdateSaleInvoiceStatusDto } from '../dto/sale-invoice/update-sale-invoice-status.dto';

@Controller('tenant/sale-invoices')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SaleInvoiceController {
  constructor(private readonly saleInvoiceService: SaleInvoiceService) {}

  @Get()
  @RequirePermissions('LIST_SALE_INVOICE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: Request,
    @Query('invoiceStatus') invoiceStatus?: string,
    @Query('retailerId') retailerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.saleInvoiceService.list(
      tenantDb,
      page,
      limit,
      { retailerId, dateFrom, dateTo, invoiceStatus, search },
      req.user as { userId: string },
    );
  }

  @Post('create')
  @RequirePermissions('CREATE_SALE_INVOICE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleInvoiceDto,
    @Req() req: Request,
  ) {
    return this.saleInvoiceService.create(
      tenantDb,
      dto,
      req.user as { userId: string },
    );
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_SALE_INVOICE')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateSaleInvoiceStatusDto,
    @Req() req: Request,
  ) {
    return this.saleInvoiceService.updateStatus(
      tenantDb,
      id,
      dto,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_INVOICE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.saleInvoiceService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
}
