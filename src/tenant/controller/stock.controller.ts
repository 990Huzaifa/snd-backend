import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { ImportStockDto } from '../dto/stock/import-stock.dto';
import { StockImportService } from '../service/stock-import.service';

@Controller('tenant/stocks')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class StockController {
  constructor(private readonly stockImportService: StockImportService) {}

  @Post('import')
  @RequirePermissions('CREATE_OPENING_STOCK', 'CREATE_PURCHASE_STOCK')
  @UseInterceptors(FileInterceptor('file'))
  importStock(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: ImportStockDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.stockImportService.importStock(tenantDb, dto, file, req.user as { userId: string });
  }
}
