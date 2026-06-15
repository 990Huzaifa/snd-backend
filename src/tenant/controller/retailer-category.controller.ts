import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode, TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { RetailerCategoryService } from '../service/retailer/retailer-category.service';
import { CreateRetailerCategoryDto } from '../dto/retailer-category/create-retailer-category.dto';
import { UpdateRetailerCategoryDto } from '../dto/retailer-category/update-retailer-category.dto';

@Controller('tenant/retailer-categories')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class RetailerCategoryController {
  constructor(private readonly shopCategoryService: RetailerCategoryService) {}

  @Post('create')
  @RequirePermissions('CREATE_RETAILER_CATEGORY')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateRetailerCategoryDto,
    @Req() req: Request,
  ) {
    return this.shopCategoryService.create(tenantDb, dto, req.user);
  }

  @Post('import')
  @RequirePermissions('CREATE_RETAILER_CATEGORY')
  @UseInterceptors(FileInterceptor('file'))
  importCategories(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    return this.shopCategoryService.importCategories(tenantDb, file, req.user, tenantCode);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_RETAILER_CATEGORY')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateRetailerCategoryDto,
    @Req() req: Request,
  ) {
    return this.shopCategoryService.edit(tenantDb, id, dto, req.user);
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
