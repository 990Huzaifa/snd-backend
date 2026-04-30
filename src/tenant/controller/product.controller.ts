import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { CreateProductDto } from '../dto/product/create-product.dto';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import { ProductService } from '../service/product.service';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('tenant/products')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('create')
  @RequirePermissions('CREATE_PRODUCT')
  @UseInterceptors(FilesInterceptor('images', 10))
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateProductDto,
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.productService.create(tenantDb, dto, req.user, files);
  }

  @Get()
  @RequirePermissions('LIST_PRODUCT')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.productService.list(
      tenantDb,
      page,
      limit,
      req.user,
      search,
      categoryId,
      brandId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PRODUCT')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.productService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PRODUCT')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: Request,
  ) {
    return this.productService.edit(tenantDb, id, dto, req.user);
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_PRODUCT')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Query('status') status: boolean,
    @Req() req: Request,
  ) {
    return this.productService.updateStatus(tenantDb, id, status, req.user);
  }
}
