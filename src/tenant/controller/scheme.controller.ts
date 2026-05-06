import {
  Body,
  Controller,
  Delete,
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
import { CreateSchemeDto } from '../dto/scheme/create-scheme.dto';
import { UpdateSchemeDto } from '../dto/scheme/update-scheme.dto';
import { SchemeService } from '../service/scheme.service';
import { RetailerSchemeEngineService } from '../service/retailer-scheme-engine.service';
import { ProductSchemeEngineService } from '../service/product-scheme-engine.service';
import { SaleOrder } from 'src/tenant-db/entities/saleorder.entity';

@Controller('tenant/schemes')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SchemeController {
  constructor(
    private readonly schemeService: SchemeService,
    private readonly retailerSchemeEngineService: RetailerSchemeEngineService,
    private readonly productSchemeEngineService: ProductSchemeEngineService,
  ) {}

  @Post('create')
  @RequirePermissions('CREATE_SCHEME')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSchemeDto,
    @Req() req: Request,
  ) {
    return this.schemeService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_SCHEME')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
    @Query('isActive') isActive?: string,
  ) {
    return this.schemeService.list(tenantDb, page, limit, search, isActive, req.user);
  }

  @Get(':id')
  @RequirePermissions('VIEW_SCHEME')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.schemeService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SCHEME')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateSchemeDto,
    @Req() req: Request,
  ) {
    return this.schemeService.edit(tenantDb, id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SCHEME')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.schemeService.delete(tenantDb, id, req.user);
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_SCHEME')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Query('status') status: boolean,
    @Req() req: Request,
  ) {
    return this.schemeService.updateStatus(tenantDb, id, status, req.user);
  }

  @Post('calculate/order/:orderId')
  @RequirePermissions('VIEW_SCHEME')
  async calculateOrderSchemes(
    @TenantConnection() tenantDb: DataSource,
    @Param('orderId') orderId: string,
  ) {
    const orderRef = { id: orderId } as SaleOrder;
    const [retailerSchemes, productSchemes] = await Promise.all([
      this.retailerSchemeEngineService.calculateRetailerEligibleSchemes(tenantDb, orderRef),
      this.productSchemeEngineService.calculateProductEligibleSchemes(tenantDb, orderRef),
    ]);

    return {
      orderId,
      retailerSchemes,
      productSchemes,
    };
  }
}
