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
import { salesmanRetailerImageMulterOptions } from '../../config/salesman-retailer-image.multer';
import { salesmanSaleVoucherSyncMulterOptions } from '../../config/salesman-sale-voucher-sync.multer';
import { BulkCreateRetailerDto } from '../../dto/salesman-app/retailer/create-retailer.dto';
import { BulkCreateSaleOrderDto } from '../../dto/salesman-app/saleorder/bulk-create-saleorder.dto';
import { BulkCreateSaleVoucherDto } from '../../dto/salesman-app/sale-voucher/bulk-create-sale-voucher.dto';
import { BulkCreateSaleReturnDto } from '../../dto/salesman-app/sale-return/bulk-create-sale-return.dto';
import { SalesmanSyncUpService } from '../../service/salesman-app/sync-up.service';

@Controller('tenant/salesman')
@UseGuards(
    TenantJwtAuthGuard,
    TenantJwtGuard,
    TenantConnectionGuard,
    TenantPermissionGuard,
)
export class SalesmanSyncUpController {
    constructor(private readonly syncUpService: SalesmanSyncUpService) {}

    @Post('retailers')
    @RequirePermissions('SALESMAN_SYNC_UP')
    @UseInterceptors(AnyFilesInterceptor(salesmanRetailerImageMulterOptions))
    createRetailers(
        @TenantConnection() tenantDb: DataSource,
        @TenantCode() tenantCode: string,
        @Body() dto: BulkCreateRetailerDto,
        @UploadedFiles() files: Express.Multer.File[] | undefined,
        @Req() req: Request,
    ) {
        return this.syncUpService.createRetailers(
            tenantDb,
            dto,
            files,
            req.user as { userId: string },
            tenantCode,
        );
    }

    @Post('sale-orders')
    @RequirePermissions('SALESMAN_SYNC_UP')
    createSaleOrders(
        @TenantConnection() tenantDb: DataSource,
        @TenantCode() tenantCode: string,
        @Body() dto: BulkCreateSaleOrderDto,
        @Req() req: Request,
    ) {
        return this.syncUpService.createSaleOrders(
            tenantDb,
            dto,
            req.user as { userId: string },
            tenantCode,
        );
    }

    @Post('sale-returns')
    @RequirePermissions('SALESMAN_SYNC_UP')
    createSaleReturns(
        @TenantConnection() tenantDb: DataSource,
        @TenantCode() tenantCode: string,
        @Body() dto: BulkCreateSaleReturnDto,
        @Req() req: Request,
    ) {
        return this.syncUpService.createSaleReturns(
            tenantDb,
            dto,
            req.user as { userId: string },
            tenantCode,
        );
    }

    @Post('sale-vouchers')
    @RequirePermissions('SALESMAN_SYNC_UP')
    @UseInterceptors(AnyFilesInterceptor(salesmanSaleVoucherSyncMulterOptions))
    createSaleVouchers(
        @TenantConnection() tenantDb: DataSource,
        @TenantCode() tenantCode: string,
        @Body() dto: BulkCreateSaleVoucherDto,
        @UploadedFiles() files: Express.Multer.File[] | undefined,
        @Req() req: Request,
    ) {
        return this.syncUpService.createSaleVouchers(
            tenantDb,
            dto,
            files,
            req.user as { userId: string },
            tenantCode,
        );
    }
}
