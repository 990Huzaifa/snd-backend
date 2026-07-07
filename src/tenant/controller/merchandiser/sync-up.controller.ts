import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import {
  TenantCode,
  TenantConnection,
} from 'src/common/tenant/tenant-connection.decorator';
import { merchandiserMerchandisingImageMulterOptions } from '../../config/merchandiser-merchandising-image.multer';
import { BulkCreateRetailerMerchandisingDto } from '../../dto/merchandiser-app/retailer-merchandising/bulk-create-retailer-merchandising.dto';
import { MerchandiserSyncUpService } from '../../service/merchandiser-app/sync-up.service';

@Controller('tenant/merchandiser')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class MerchandiserSyncUpController {
  constructor(private readonly syncUpService: MerchandiserSyncUpService) {}

  @Post('retailer-merchandising')
  @RequirePermissions('MERCHANDISER_SYNC_UP')
  @UseInterceptors(AnyFilesInterceptor(merchandiserMerchandisingImageMulterOptions))
  createRetailerMerchandising(
    @TenantConnection() tenantDb: DataSource,
    @TenantCode() tenantCode: string,
    @Body() dto: BulkCreateRetailerMerchandisingDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    return this.syncUpService.createRetailerMerchandising(
      tenantDb,
      dto,
      files,
      req.user as { userId: string },
      tenantCode,
    );
  }
}
