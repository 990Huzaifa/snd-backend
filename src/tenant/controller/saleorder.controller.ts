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
import { SaleOrderService } from '../service/saleorder.service';
import { CreateSaleOrderDto } from '../dto/saleorder/create-saleorder.dto';
import { UpdateSaleOrderDto } from '../dto/saleorder/update-saleorder.dto';
import { OrderStatus } from 'src/tenant-db/entities/saleorder.entity';
import { GetProductSchemesDto } from '../dto/saleorder/get-product-schemes.dto';

@Controller('tenant/saleorders')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SaleOrderController {
  constructor(private readonly saleOrderService: SaleOrderService) {}

  @Get()
  @RequirePermissions('LIST_SALE_ORDER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.saleOrderService.list(
      tenantDb,
      page,
      limit,
      search,
      req.user as { userId: string },
    );
  }

  @Post('create')
  @RequirePermissions('CREATE_SALE_ORDER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleOrderDto,
    @Req() req: Request,
  ) {
    return this.saleOrderService.create(
      tenantDb,
      dto,
      req.user as { userId: string },
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_ORDER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateSaleOrderDto,
    @Req() req: Request,
  ) {
    return this.saleOrderService.edit(
      tenantDb,
      id,
      dto,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_ORDER')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.saleOrderService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
  

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_SALE_ORDER_STATUS')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Query('status') status: OrderStatus,
    @Req() req: Request,
  ) {
    return this.saleOrderService.updateStatus(
      tenantDb,
      id,
      status as OrderStatus,
      req.user as { userId: string },
    );
  }

  @Post('product-schemes')
  @RequirePermissions('VIEW_SALE_ORDER')
  getProductSchemes(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: GetProductSchemesDto,
  ) {
    return this.saleOrderService.getEligibleProductSchemes(tenantDb, dto);
  }
}
