import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
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
import { SaleReturnService } from '../service/sale-return.service';
import { CreateSaleReturnDto } from '../dto/sale-return/create-sale-return.dto';
import { UpdateSaleReturnDto } from '../dto/sale-return/update-sale-return.dto';
import { ReturnStatus } from 'src/tenant-db/entities/sale-return.entity';

@Controller('tenant/sale-returns')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class SaleReturnController {
  constructor(private readonly saleReturnService: SaleReturnService) {}

  @Get()
  @RequirePermissions('LIST_SALE_RETURN')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: Request,
    @Query('returnStatus') returnStatus?: string,
    @Query('returnType') returnType?: string,
    @Query('retailerIds') retailerIds?: string,
    @Query('shopName') shopName?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.saleReturnService.list(
      tenantDb,
      page,
      limit,
      {
        retailerIds,
        shopName,
        dateFrom,
        dateTo,
        returnStatus,
        returnType,
        search,
      },
      req.user as { userId: string },
    );
  }

  @Post('create')
  @RequirePermissions('CREATE_SALE_RETURN')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleReturnDto,
    @Req() req: Request,
  ) {
    return this.saleReturnService.create(
      tenantDb,
      dto,
      req.user as { userId: string },
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_RETURN')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateSaleReturnDto,
    @Req() req: Request,
  ) {
    return this.saleReturnService.edit(
      tenantDb,
      id,
      dto,
      req.user as { userId: string },
    );
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_SALE_RETURN')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Query('returnStatus', new ParseEnumPipe(ReturnStatus))
    returnStatus: ReturnStatus,
    @Req() req: Request,
  ) {
    return this.saleReturnService.updateStatus(
      tenantDb,
      id,
      { returnStatus },
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_RETURN')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.saleReturnService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
}
