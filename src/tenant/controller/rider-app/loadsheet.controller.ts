import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
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
import { riderDeliveryImageMulterOptions } from '../../config/rider-delivery-image.multer';
import { ListRiderLoadsheetDto } from '../../dto/rider-app/loadsheet/list-rider-loadsheet.dto';
import { UpdateOrderDeliveryDto } from '../../dto/rider-app/loadsheet/update-order-delivery.dto';
import { BulkUpdateLoadsheetDeliveryDto } from '../../dto/rider-app/loadsheet/bulk-update-loadsheet-delivery.dto';
import { RiderLoadsheetService } from '../../service/rider-app/loadsheet.service';

@Controller('tenant/rider/loadsheets')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class RiderLoadsheetController {
  constructor(private readonly riderLoadsheetService: RiderLoadsheetService) {}

  @Get()
  @RequirePermissions('LIST_LOADSHEET')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query() query: ListRiderLoadsheetDto,
    @Req() req: Request,
  ) {
    return this.riderLoadsheetService.fetchRiderLoadsheets(
      tenantDb,
      query,
      req.user as { userId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_LOADSHEET')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.riderLoadsheetService.viewRiderLoadsheet(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }

  @Put(':id/start')
  @RequirePermissions('UPDATE_LOADSHEET_STATUS')
  start(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.riderLoadsheetService.startLoadsheet(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }

  @Put(':id/orders/:loadSheetOrderId/delivery')
  @RequirePermissions('UPDATE_LOADSHEET')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'customerSignature', maxCount: 1 },
        { name: 'deliveryProof', maxCount: 1 },
      ],
      riderDeliveryImageMulterOptions,
    ),
  )
  updateOrderDelivery(
    @TenantConnection() tenantDb: DataSource,
    @TenantCode() tenantCode: string,
    @Param('id') loadSheetId: string,
    @Param('loadSheetOrderId') loadSheetOrderId: string,
    @Body() dto: UpdateOrderDeliveryDto,
    @UploadedFiles()
    files: {
      customerSignature?: Express.Multer.File[];
      deliveryProof?: Express.Multer.File[];
    },
    @Req() req: Request,
  ) {
    return this.riderLoadsheetService.updateOrderDelivery(
      tenantDb,
      tenantCode,
      loadSheetId,
      loadSheetOrderId,
      dto,
      req.user as { userId: string },
      {
        customerSignature: files?.customerSignature?.[0],
        deliveryProof: files?.deliveryProof?.[0],
      },
    );
  }

  @Put(':id/deliveries/bulk')
  @RequirePermissions('UPDATE_LOADSHEET')
  bulkUpdateDeliveries(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') loadSheetId: string,
    @Body() dto: BulkUpdateLoadsheetDeliveryDto,
    @Req() req: Request,
  ) {
    return this.riderLoadsheetService.bulkUpdateLoadsheetDeliveries(
      tenantDb,
      loadSheetId,
      dto,
      req.user as { userId: string },
    );
  }
}
