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
import { BulkCreateRetailerDto } from '../../dto/salesman-app/retailer/create-retailer.dto';
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
}
