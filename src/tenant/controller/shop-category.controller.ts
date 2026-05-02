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
import { ShopCategoryService } from '../service/shop-category.service';
import { CreateShopCategoryDto } from '../dto/shop-category/create-shop-category.dto';

@Controller('tenant/shop-categories')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class ShopCategoryController {
  constructor(private readonly shopCategoryService: ShopCategoryService) {}

  @Post('create')
  @RequirePermissions('CREATE_RETAILER_CATEGORY')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateShopCategoryDto,
    @Req() req: Request,
  ) {
    return this.shopCategoryService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_RETAILER_CATEGORY')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.shopCategoryService.list(tenantDb, page, limit, search, req.user);
  }

  @Get(':id')
  @RequirePermissions('VIEW_RETAILER_CATEGORY')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.shopCategoryService.view(tenantDb, id, req.user);
  }
}
