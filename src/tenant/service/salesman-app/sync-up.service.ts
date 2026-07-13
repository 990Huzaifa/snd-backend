import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { S3Service } from 'src/common/s3/s3.service';
import {
    Retailer,
    RetailerCategory,
    RetailerChannel,
    Status,
} from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { ASSET_RULES, AssetPurpose } from '../../config/asset-rules.config';
import {
    SALESMAN_RETAILER_SYNC_MAX_SHOPS,
} from '../../config/salesman-retailer-image.multer';
import { ActivityLogService } from '../activity-log.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';
import {
    BulkCreateRetailerDto,
    CreateRetailerShopDto,
} from '../../dto/salesman-app/retailer/create-retailer.dto';
import {
    BulkCreateSaleOrderDto,
    SALESMAN_SALE_ORDER_SYNC_MAX,
} from '../../dto/salesman-app/saleorder/bulk-create-saleorder.dto';
import { CreateSaleOrderDto } from '../../dto/saleorder/create-saleorder.dto';
import { SaleOrderService } from '../saleorder.service';
import {
    BulkCreateSaleVoucherDto,
} from '../../dto/salesman-app/sale-voucher/bulk-create-sale-voucher.dto';
import { CreateSaleVoucherDto } from '../../dto/sale-voucher/create-sale-voucher.dto';
import {
    PAYMENT_PROOF_ALLOWED_MIME_TYPES,
    PAYMENT_PROOF_MAX_BYTES,
} from '../../config/sale-voucher-payment-proof.multer';
import {
    SALESMAN_SALE_VOUCHER_SYNC_MAX,
} from '../../config/salesman-sale-voucher-sync.multer';
import { SaleVoucherService } from '../sale-voucher.service';
import {
    BulkCreateSaleReturnDto,
    SALESMAN_SALE_RETURN_SYNC_MAX,
} from '../../dto/salesman-app/sale-return/bulk-create-sale-return.dto';
import { CreateSaleReturnDto } from '../../dto/sale-return/create-sale-return.dto';
import { SaleReturnService } from '../sale-return.service';
import {
    BulkSyncRetailerInventoryDto,
    SALESMAN_RETAILER_INVENTORY_SYNC_MAX,
    SyncRetailerInventoryItemDto,
} from '../../dto/salesman-app/retailer-inventory/sync-retailer-inventory.dto';
import { RetailerInventoryService } from '../retailer/retailer-inventory.service';

const DEFAULT_MAX_RADIUS = '1';
const DEFAULT_CREDIT_LIMIT = '0.00';
const RETAILER_IMAGE_RULES = ASSET_RULES[AssetPurpose.RETAILER_IMAGE];

type ShopImagePayload = {
    buffer: Buffer;
    mimetype: string;
};

type RetailerSyncRow = {
    row: number;
    shop: CreateRetailerShopDto;
    image?: ShopImagePayload;
};

type SaleOrderSyncRow = {
    row: number;
    order: CreateSaleOrderDto;
};

type PaymentProofPayload = {
    buffer: Buffer;
    mimetype: string;
};

type SaleVoucherSyncRow = {
    row: number;
    voucher: CreateSaleVoucherDto;
    paymentProof?: PaymentProofPayload;
};

type SaleReturnSyncRow = {
    row: number;
    saleReturn: CreateSaleReturnDto;
};

type RetailerInventorySyncRow = {
    row: number;
    item: SyncRetailerInventoryItemDto;
};

@Injectable()
export class SalesmanSyncUpService {
    constructor(
        private readonly activityLogService: ActivityLogService,
        private readonly notificationService: NotificationService,
        private readonly tenantJobService: TenantJobService,
        private readonly s3Service: S3Service,
        private readonly saleOrderService: SaleOrderService,
        private readonly saleVoucherService: SaleVoucherService,
        private readonly saleReturnService: SaleReturnService,
        private readonly retailerInventoryService: RetailerInventoryService,
    ) {}

    private normalize(value: string): string {
        return value.trim();
    }

    private normalizeOptional(value?: string | null): string | null {
        if (value === undefined || value === null) {
            return null;
        }
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    }

    private buildSyncRows(
        dto: BulkCreateRetailerDto,
        imagesByIndex: Map<number, ShopImagePayload>,
    ): RetailerSyncRow[] {
        return dto.shops.map((shop, index) => ({
            row: index + 1,
            shop,
            image: imagesByIndex.get(index),
        }));
    }

    private parseShopImageFieldIndex(fieldname: string): number | null {
        const bracketMatch = fieldname.match(/^images\[(\d+)\]$/);
        if (bracketMatch) {
            return Number(bracketMatch[1]);
        }

        const underscoreMatch = fieldname.match(/^images?_(\d+)$/);
        if (underscoreMatch) {
            return Number(underscoreMatch[1]);
        }

        if (fieldname === 'image' || fieldname === 'images') {
            return 0;
        }

        return null;
    }

    private imageExtension(mimetype: string): string {
        if (mimetype === 'image/png') {
            return 'png';
        }
        if (mimetype === 'image/jpeg') {
            return 'jpg';
        }
        if (mimetype === 'image/webp') {
            return 'webp';
        }
        throw new BadRequestException('Image must be PNG, JPEG, or WebP');
    }

    private assertRetailerImageFile(file: Express.Multer.File, fieldname: string): void {
        if (
            !RETAILER_IMAGE_RULES.allowedMimeTypes.includes(
                file.mimetype as (typeof RETAILER_IMAGE_RULES.allowedMimeTypes)[number],
            )
        ) {
            throw new BadRequestException(
                `${fieldname} must be a PNG, JPEG, or WebP image`,
            );
        }
        if (!file.buffer?.length) {
            throw new BadRequestException(`${fieldname} file is empty`);
        }
        if (file.size > RETAILER_IMAGE_RULES.maxSizeBytes) {
            throw new BadRequestException(
                `${fieldname} must not exceed ${RETAILER_IMAGE_RULES.maxSizeBytes} bytes`,
            );
        }
    }

    private extractShopImages(
        files: Express.Multer.File[] | undefined,
        shopCount: number,
    ): Map<number, ShopImagePayload> {
        const imagesByIndex = new Map<number, ShopImagePayload>();
        if (!files?.length) {
            return imagesByIndex;
        }

        for (const file of files) {
            const index = this.parseShopImageFieldIndex(file.fieldname);
            if (index === null) {
                continue;
            }

            if (index < 0 || index >= shopCount) {
                throw new BadRequestException(
                    `Image field ${file.fieldname} does not match any shop index`,
                );
            }

            if (imagesByIndex.has(index)) {
                throw new BadRequestException(
                    `Multiple images provided for shop index ${index}`,
                );
            }

            this.assertRetailerImageFile(file, file.fieldname);
            imagesByIndex.set(index, {
                buffer: file.buffer,
                mimetype: file.mimetype,
            });
        }

        return imagesByIndex;
    }

    private async uploadRetailerImage(
        tenantCode: string,
        retailerId: string,
        image: ShopImagePayload,
    ): Promise<string> {
        const extension = this.imageExtension(image.mimetype);
        const key = `tenants/${tenantCode}/retailers/images/${retailerId}/0.${extension}`;
        const { url } = await this.s3Service.uploadObject(
            key,
            image.buffer,
            image.mimetype,
        );
        return url;
    }

    private async buildRetailerEntity(
        row: RetailerSyncRow,
        userId: string,
        tenantCode: string,
    ): Promise<Partial<Retailer>> {
        const retailerId = randomUUID();
        let imageUrl = this.normalizeOptional(row.shop.image);

        if (row.image) {
            imageUrl = await this.uploadRetailerImage(tenantCode, retailerId, row.image);
        }

        return {
            id: retailerId,
            ...this.toRetailerEntity(row.shop, userId),
            image: imageUrl,
        };
    }

    private async notifySyncCompletion(
        tenantDb: DataSource,
        job: TenantJob,
        user: { userId: string },
        tenantCode: string,
        status: 'completed' | 'failed',
    ) {
        const title =
            status === 'completed'
                ? 'Retailer sync completed'
                : 'Retailer sync failed';
        const message =
            status === 'completed'
                ? `Sync finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
                : `Retailer sync failed. Please review sync logs.`;

        await this.notificationService.createNotification(
            tenantDb,
            {
                userId: user.userId,
                title,
                message,
                type: 'salesman_retailer_sync',
            },
            tenantCode,
            {
                job: {
                    id: job.id,
                    jobType: job.jobType,
                    status,
                    fileName: job.fileName,
                    totalRows: job.totalRows,
                    inserted: job.inserted,
                    failed: job.failed,
                    completedAt: job.completedAt,
                    logs: job.logs,
                },
            },
        );
    }

    private validateRowReferences(
        shop: CreateRetailerShopDto,
        routeIds: Set<string>,
        categoryIds: Set<string>,
        channelIds: Set<string>,
    ): string | null {
        if (!routeIds.has(shop.routeId)) {
            return 'Route not found';
        }
        if (!categoryIds.has(shop.retailerCategoryId)) {
            return 'Retailer category not found';
        }
        if (!channelIds.has(shop.retailerChannelId)) {
            return 'Retailer channel not found';
        }
        return null;
    }

    private toRetailerEntity(
        shop: CreateRetailerShopDto,
        userId: string,
    ): Partial<Retailer> {
        const status = shop.status ?? Status.PENDING;
        return {
            shopName: this.normalize(shop.shopName),
            ownerName: this.normalize(shop.ownerName),
            image: this.normalizeOptional(shop.image),
            phone: this.normalizeOptional(shop.phone),
            CNIC: this.normalizeOptional(shop.CNIC),
            address: this.normalize(shop.address),
            latitude: this.normalize(shop.latitude),
            longitude: this.normalize(shop.longitude),
            maxRadius: DEFAULT_MAX_RADIUS,
            creditLimit: DEFAULT_CREDIT_LIMIT,
            class: shop.class,
            status,
            createdBy: userId,
            approvedBy: status === Status.PENDING ? null : userId,
            routeId: shop.routeId,
            retailerCategoryId: shop.retailerCategoryId,
            retailerChannelId: shop.retailerChannelId,
        };
    }

    private async processCreateRetailersJob(
        tenantDb: DataSource,
        jobId: string,
        rows: RetailerSyncRow[],
        user: { userId: string },
        tenantCode: string,
    ) {
        this.tenantJobService.startJob(jobId);

        const routeIds = new Set(
            (
                await tenantDb.getRepository(Route).find({
                    where: { id: In([...new Set(rows.map((row) => row.shop.routeId))]) },
                    select: ['id'],
                })
            ).map((route) => route.id),
        );

        const categoryIds = new Set(
            (
                await tenantDb.getRepository(RetailerCategory).find({
                    where: {
                        id: In([...new Set(rows.map((row) => row.shop.retailerCategoryId))]),
                    },
                    select: ['id'],
                })
            ).map((category) => category.id),
        );

        const channelIds = new Set(
            (
                await tenantDb.getRepository(RetailerChannel).find({
                    where: {
                        id: In([...new Set(rows.map((row) => row.shop.retailerChannelId))]),
                    },
                    select: ['id'],
                })
            ).map((channel) => channel.id),
        );

        const retailerRepo = tenantDb.getRepository(Retailer);
        const validRows: Array<{ row: RetailerSyncRow; entity: Partial<Retailer> }> = [];

        for (const row of rows) {
            const shopLabel = this.normalizeOptional(row.shop.shopName) ?? `Row ${row.row}`;
            const referenceError = this.validateRowReferences(
                row.shop,
                routeIds,
                categoryIds,
                channelIds,
            );

            if (referenceError) {
                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: shopLabel,
                    status: 'error',
                    error: referenceError,
                });
                continue;
            }

            try {
                validRows.push({
                    row,
                    entity: await this.buildRetailerEntity(row, user.userId, tenantCode),
                });
            } catch (error) {
                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: shopLabel,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        if (validRows.length) {
            try {
                const saved = await retailerRepo.save(
                    validRows.map((item) => retailerRepo.create(item.entity)),
                );

                saved.forEach((created, index) => {
                    const source = validRows[index];
                    const shopLabel =
                        this.normalizeOptional(source.row.shop.shopName) ??
                        `Row ${source.row.row}`;
                    this.tenantJobService.appendLog(jobId, {
                        row: source.row.row,
                        name: shopLabel,
                        status: 'success',
                        metadata: { retailerId: created.id },
                    });
                });
            } catch {
                for (const item of validRows) {
                    const shopLabel =
                        this.normalizeOptional(item.row.shop.shopName) ??
                        `Row ${item.row.row}`;
                    try {
                        const created = await retailerRepo.save(
                            retailerRepo.create(item.entity),
                        );
                        this.tenantJobService.appendLog(jobId, {
                            row: item.row.row,
                            name: shopLabel,
                            status: 'success',
                            metadata: { retailerId: created.id },
                        });
                    } catch (error) {
                        this.tenantJobService.appendLog(jobId, {
                            row: item.row.row,
                            name: shopLabel,
                            status: 'error',
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                    }
                }
            }
        }

        const completedJob = this.tenantJobService.completeJob(jobId);

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_COMPLETED',
            description: `Salesman retailer sync completed for ${completedJob.fileName}`,
            metadata: {
                jobId: completedJob.id,
                jobType: completedJob.jobType,
                fileName: completedJob.fileName,
                totalRows: completedJob.totalRows,
                inserted: completedJob.inserted,
                failed: completedJob.failed,
            },
        });

        await this.notifySyncCompletion(tenantDb, completedJob, user, tenantCode, 'completed');
    }

    async createRetailers(
        tenantDb: DataSource,
        dto: BulkCreateRetailerDto,
        files: Express.Multer.File[] | undefined,
        user: { userId: string },
        tenantCode: string,
    ) {
        if (!dto.shops?.length) {
            throw new BadRequestException('At least one shop is required');
        }

        if (dto.shops.length > SALESMAN_RETAILER_SYNC_MAX_SHOPS) {
            throw new BadRequestException(
                `At most ${SALESMAN_RETAILER_SYNC_MAX_SHOPS} shops are allowed per sync`,
            );
        }

        const imagesByIndex = this.extractShopImages(files, dto.shops.length);
        const rows = this.buildSyncRows(dto, imagesByIndex);
        const fileName = `salesman-retailer-sync-${new Date().toISOString()}`;

        const job = this.tenantJobService.createJob({
            tenantCode,
            jobType: 'SALESMAN_RETAILER_SYNC',
            fileName,
            createdBy: user.userId,
            totalRows: rows.length,
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_STARTED',
            description: `Salesman retailer sync started (${rows.length} shops)`,
            metadata: {
                jobId: job.id,
                jobType: job.jobType,
                fileName,
                totalRows: rows.length,
            },
        });

        void this.processCreateRetailersJob(tenantDb, job.id, rows, user, tenantCode).catch(
            async (error) => {
                this.tenantJobService.failJob(job.id);
                this.tenantJobService.appendLog(job.id, {
                    row: 0,
                    name: '',
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown processing failure',
                });

                const failedJob = this.tenantJobService.getJobById(job.id, tenantCode, user.userId);

                await this.activityLogService.recordActivityLog(tenantDb, {
                    actorId: user.userId,
                    action: 'TENANT_JOB_FAILED',
                    description: `Salesman retailer sync failed`,
                    metadata: {
                        jobId: job.id,
                        jobType: job.jobType,
                        fileName,
                        error: error instanceof Error ? error.message : String(error),
                    },
                });

                await this.notifySyncCompletion(tenantDb, failedJob, user, tenantCode, 'failed');
            },
        );

        return {
            message: 'Retailer sync started',
            jobId: job.id,
            status: job.status,
            totalRows: job.totalRows,
        };
    }

    private buildSaleOrderSyncRows(dto: BulkCreateSaleOrderDto): SaleOrderSyncRow[] {
        return dto.orders.map((order, index) => ({
            row: index + 1,
            order,
        }));
    }

    private saleOrderRowLabel(order: CreateSaleOrderDto, row: number): string {
        return order.retailerId ? `Retailer ${order.retailerId}` : `Row ${row}`;
    }

    private async notifySaleOrderSyncCompletion(
        tenantDb: DataSource,
        job: TenantJob,
        user: { userId: string },
        tenantCode: string,
        status: 'completed' | 'failed',
    ) {
        const title =
            status === 'completed'
                ? 'Sale order sync completed'
                : 'Sale order sync failed';
        const message =
            status === 'completed'
                ? `Sync finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
                : 'Sale order sync failed. Please review sync logs.';

        await this.notificationService.createNotification(
            tenantDb,
            {
                userId: user.userId,
                title,
                message,
                type: 'salesman_sale_order_sync',
            },
            tenantCode,
            {
                job: {
                    id: job.id,
                    jobType: job.jobType,
                    status,
                    fileName: job.fileName,
                    totalRows: job.totalRows,
                    inserted: job.inserted,
                    failed: job.failed,
                    completedAt: job.completedAt,
                    logs: job.logs,
                },
            },
        );
    }

    private async processCreateSaleOrdersJob(
        tenantDb: DataSource,
        jobId: string,
        rows: SaleOrderSyncRow[],
        user: { userId: string },
        tenantCode: string,
    ) {
        this.tenantJobService.startJob(jobId);

        for (const row of rows) {
            const orderLabel = this.saleOrderRowLabel(row.order, row.row);

            try {
                const created = await this.saleOrderService.create(
                    tenantDb,
                    row.order,
                    user,
                );

                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: created.orderNumber ?? orderLabel,
                    status: 'success',
                    metadata: {
                        saleOrderId: created.id,
                        orderNumber: created.orderNumber,
                    },
                });
            } catch (error) {
                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: orderLabel,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        const completedJob = this.tenantJobService.completeJob(jobId);

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_COMPLETED',
            description: `Salesman sale order sync completed for ${completedJob.fileName}`,
            metadata: {
                jobId: completedJob.id,
                jobType: completedJob.jobType,
                fileName: completedJob.fileName,
                totalRows: completedJob.totalRows,
                inserted: completedJob.inserted,
                failed: completedJob.failed,
            },
        });

        await this.notifySaleOrderSyncCompletion(
            tenantDb,
            completedJob,
            user,
            tenantCode,
            'completed',
        );
    }

    async createSaleOrders(
        tenantDb: DataSource,
        dto: BulkCreateSaleOrderDto,
        user: { userId: string },
        tenantCode: string,
    ) {
        if (!dto.orders?.length) {
            throw new BadRequestException('At least one sale order is required');
        }

        if (dto.orders.length > SALESMAN_SALE_ORDER_SYNC_MAX) {
            throw new BadRequestException(
                `At most ${SALESMAN_SALE_ORDER_SYNC_MAX} sale orders are allowed per sync`,
            );
        }

        const rows = this.buildSaleOrderSyncRows(dto);
        const fileName = `salesman-sale-order-sync-${new Date().toISOString()}`;

        const job = this.tenantJobService.createJob({
            tenantCode,
            jobType: 'SALESMAN_SALE_ORDER_SYNC',
            fileName,
            createdBy: user.userId,
            totalRows: rows.length,
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_STARTED',
            description: `Salesman sale order sync started (${rows.length} orders)`,
            metadata: {
                jobId: job.id,
                jobType: job.jobType,
                fileName,
                totalRows: rows.length,
            },
        });

        void this.processCreateSaleOrdersJob(tenantDb, job.id, rows, user, tenantCode).catch(
            async (error) => {
                this.tenantJobService.failJob(job.id);
                this.tenantJobService.appendLog(job.id, {
                    row: 0,
                    name: '',
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown processing failure',
                });

                const failedJob = this.tenantJobService.getJobById(job.id, tenantCode, user.userId);

                await this.activityLogService.recordActivityLog(tenantDb, {
                    actorId: user.userId,
                    action: 'TENANT_JOB_FAILED',
                    description: 'Salesman sale order sync failed',
                    metadata: {
                        jobId: job.id,
                        jobType: job.jobType,
                        fileName,
                        error: error instanceof Error ? error.message : String(error),
                    },
                });

                await this.notifySaleOrderSyncCompletion(
                    tenantDb,
                    failedJob,
                    user,
                    tenantCode,
                    'failed',
                );
            },
        );

        return {
            message: 'Sale order sync started',
            jobId: job.id,
            status: job.status,
            totalRows: job.totalRows,
        };
    }

    private buildSaleReturnSyncRows(dto: BulkCreateSaleReturnDto): SaleReturnSyncRow[] {
        return dto.returns.map((saleReturn, index) => ({
            row: index + 1,
            saleReturn,
        }));
    }

    private saleReturnRowLabel(saleReturn: CreateSaleReturnDto, row: number): string {
        return saleReturn.retailerId ? `Retailer ${saleReturn.retailerId}` : `Row ${row}`;
    }

    private async notifySaleReturnSyncCompletion(
        tenantDb: DataSource,
        job: TenantJob,
        user: { userId: string },
        tenantCode: string,
        status: 'completed' | 'failed',
    ) {
        const title =
            status === 'completed'
                ? 'Sale return sync completed'
                : 'Sale return sync failed';
        const message =
            status === 'completed'
                ? `Sync finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
                : 'Sale return sync failed. Please review sync logs.';

        await this.notificationService.createNotification(
            tenantDb,
            {
                userId: user.userId,
                title,
                message,
                type: 'salesman_sale_return_sync',
            },
            tenantCode,
            {
                job: {
                    id: job.id,
                    jobType: job.jobType,
                    status,
                    fileName: job.fileName,
                    totalRows: job.totalRows,
                    inserted: job.inserted,
                    failed: job.failed,
                    completedAt: job.completedAt,
                    logs: job.logs,
                },
            },
        );
    }

    private async processCreateSaleReturnsJob(
        tenantDb: DataSource,
        jobId: string,
        rows: SaleReturnSyncRow[],
        user: { userId: string },
        tenantCode: string,
    ) {
        this.tenantJobService.startJob(jobId);

        for (const row of rows) {
            const returnLabel = this.saleReturnRowLabel(row.saleReturn, row.row);

            try {
                const created = await this.saleReturnService.create(
                    tenantDb,
                    row.saleReturn,
                    user,
                );

                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: created.returnNumber ?? returnLabel,
                    status: 'success',
                    metadata: {
                        saleReturnId: created.id,
                        returnNumber: created.returnNumber,
                    },
                });
            } catch (error) {
                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: returnLabel,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        const completedJob = this.tenantJobService.completeJob(jobId);

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_COMPLETED',
            description: `Salesman sale return sync completed for ${completedJob.fileName}`,
            metadata: {
                jobId: completedJob.id,
                jobType: completedJob.jobType,
                fileName: completedJob.fileName,
                totalRows: completedJob.totalRows,
                inserted: completedJob.inserted,
                failed: completedJob.failed,
            },
        });

        await this.notifySaleReturnSyncCompletion(
            tenantDb,
            completedJob,
            user,
            tenantCode,
            'completed',
        );
    }

    async createSaleReturns(
        tenantDb: DataSource,
        dto: BulkCreateSaleReturnDto,
        user: { userId: string },
        tenantCode: string,
    ) {
        if (!dto.returns?.length) {
            throw new BadRequestException('At least one sale return is required');
        }

        if (dto.returns.length > SALESMAN_SALE_RETURN_SYNC_MAX) {
            throw new BadRequestException(
                `At most ${SALESMAN_SALE_RETURN_SYNC_MAX} sale returns are allowed per sync`,
            );
        }

        const rows = this.buildSaleReturnSyncRows(dto);
        const fileName = `salesman-sale-return-sync-${new Date().toISOString()}`;

        const job = this.tenantJobService.createJob({
            tenantCode,
            jobType: 'SALESMAN_SALE_RETURN_SYNC',
            fileName,
            createdBy: user.userId,
            totalRows: rows.length,
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_STARTED',
            description: `Salesman sale return sync started (${rows.length} returns)`,
            metadata: {
                jobId: job.id,
                jobType: job.jobType,
                fileName,
                totalRows: rows.length,
            },
        });

        void this.processCreateSaleReturnsJob(tenantDb, job.id, rows, user, tenantCode).catch(
            async (error) => {
                this.tenantJobService.failJob(job.id);
                this.tenantJobService.appendLog(job.id, {
                    row: 0,
                    name: '',
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown processing failure',
                });

                const failedJob = this.tenantJobService.getJobById(job.id, tenantCode, user.userId);

                await this.activityLogService.recordActivityLog(tenantDb, {
                    actorId: user.userId,
                    action: 'TENANT_JOB_FAILED',
                    description: 'Salesman sale return sync failed',
                    metadata: {
                        jobId: job.id,
                        jobType: job.jobType,
                        fileName,
                        error: error instanceof Error ? error.message : String(error),
                    },
                });

                await this.notifySaleReturnSyncCompletion(
                    tenantDb,
                    failedJob,
                    user,
                    tenantCode,
                    'failed',
                );
            },
        );

        return {
            message: 'Sale return sync started',
            jobId: job.id,
            status: job.status,
            totalRows: job.totalRows,
        };
    }

    private buildSaleVoucherSyncRows(
        dto: BulkCreateSaleVoucherDto,
        paymentProofsByIndex: Map<number, PaymentProofPayload>,
    ): SaleVoucherSyncRow[] {
        return dto.vouchers.map((voucher, index) => ({
            row: index + 1,
            voucher,
            paymentProof: paymentProofsByIndex.get(index),
        }));
    }

    private parsePaymentProofFieldIndex(fieldname: string): number | null {
        const bracketMatch = fieldname.match(/^paymentProofs?\[(\d+)\]$/);
        if (bracketMatch) {
            return Number(bracketMatch[1]);
        }

        const underscoreMatch = fieldname.match(/^paymentProofs?_(\d+)$/);
        if (underscoreMatch) {
            return Number(underscoreMatch[1]);
        }

        if (fieldname === 'paymentProof' || fieldname === 'paymentProofs') {
            return 0;
        }

        return null;
    }

    private assertPaymentProofFile(file: Express.Multer.File, fieldname: string): void {
        if (
            !PAYMENT_PROOF_ALLOWED_MIME_TYPES.includes(
                file.mimetype as (typeof PAYMENT_PROOF_ALLOWED_MIME_TYPES)[number],
            )
        ) {
            throw new BadRequestException(
                `${fieldname} must be a PNG or JPEG image`,
            );
        }
        if (!file.buffer?.length) {
            throw new BadRequestException(`${fieldname} file is empty`);
        }
        if (file.size > PAYMENT_PROOF_MAX_BYTES) {
            throw new BadRequestException(
                `${fieldname} must not exceed ${PAYMENT_PROOF_MAX_BYTES} bytes`,
            );
        }
    }

    private extractPaymentProofs(
        files: Express.Multer.File[] | undefined,
        voucherCount: number,
    ): Map<number, PaymentProofPayload> {
        const proofsByIndex = new Map<number, PaymentProofPayload>();
        if (!files?.length) {
            return proofsByIndex;
        }

        for (const file of files) {
            const index = this.parsePaymentProofFieldIndex(file.fieldname);
            if (index === null) {
                continue;
            }

            if (index < 0 || index >= voucherCount) {
                throw new BadRequestException(
                    `Payment proof field ${file.fieldname} does not match any voucher index`,
                );
            }

            if (proofsByIndex.has(index)) {
                throw new BadRequestException(
                    `Multiple payment proofs provided for voucher index ${index}`,
                );
            }

            this.assertPaymentProofFile(file, file.fieldname);
            proofsByIndex.set(index, {
                buffer: file.buffer,
                mimetype: file.mimetype,
            });
        }

        return proofsByIndex;
    }

    private toPaymentProofFile(payload: PaymentProofPayload): Express.Multer.File {
        return {
            buffer: payload.buffer,
            mimetype: payload.mimetype,
            size: payload.buffer.length,
            fieldname: 'paymentProof',
            originalname: 'payment-proof',
        } as Express.Multer.File;
    }

    private saleVoucherRowLabel(voucher: CreateSaleVoucherDto, row: number): string {
        return voucher.retailerId ? `Retailer ${voucher.retailerId}` : `Row ${row}`;
    }

    private async notifySaleVoucherSyncCompletion(
        tenantDb: DataSource,
        job: TenantJob,
        user: { userId: string },
        tenantCode: string,
        status: 'completed' | 'failed',
    ) {
        const title =
            status === 'completed'
                ? 'Sale voucher sync completed'
                : 'Sale voucher sync failed';
        const message =
            status === 'completed'
                ? `Sync finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
                : 'Sale voucher sync failed. Please review sync logs.';

        await this.notificationService.createNotification(
            tenantDb,
            {
                userId: user.userId,
                title,
                message,
                type: 'salesman_sale_voucher_sync',
            },
            tenantCode,
            {
                job: {
                    id: job.id,
                    jobType: job.jobType,
                    status,
                    fileName: job.fileName,
                    totalRows: job.totalRows,
                    inserted: job.inserted,
                    failed: job.failed,
                    completedAt: job.completedAt,
                    logs: job.logs,
                },
            },
        );
    }

    private async processCreateSaleVouchersJob(
        tenantDb: DataSource,
        jobId: string,
        rows: SaleVoucherSyncRow[],
        user: { userId: string },
        tenantCode: string,
    ) {
        this.tenantJobService.startJob(jobId);

        for (const row of rows) {
            const voucherLabel = this.saleVoucherRowLabel(row.voucher, row.row);

            try {
                const created = await this.saleVoucherService.create(
                    tenantDb,
                    tenantCode,
                    row.voucher,
                    user,
                    row.paymentProof
                        ? this.toPaymentProofFile(row.paymentProof)
                        : undefined,
                );

                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: created.voucherNumber ?? voucherLabel,
                    status: 'success',
                    metadata: {
                        saleVoucherId: created.id,
                        voucherNumber: created.voucherNumber,
                    },
                });
            } catch (error) {
                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: voucherLabel,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        const completedJob = this.tenantJobService.completeJob(jobId);

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_COMPLETED',
            description: `Salesman sale voucher sync completed for ${completedJob.fileName}`,
            metadata: {
                jobId: completedJob.id,
                jobType: completedJob.jobType,
                fileName: completedJob.fileName,
                totalRows: completedJob.totalRows,
                inserted: completedJob.inserted,
                failed: completedJob.failed,
            },
        });

        await this.notifySaleVoucherSyncCompletion(
            tenantDb,
            completedJob,
            user,
            tenantCode,
            'completed',
        );
    }

    async createSaleVouchers(
        tenantDb: DataSource,
        dto: BulkCreateSaleVoucherDto,
        files: Express.Multer.File[] | undefined,
        user: { userId: string },
        tenantCode: string,
    ) {
        if (!dto.vouchers?.length) {
            throw new BadRequestException('At least one sale voucher is required');
        }

        if (dto.vouchers.length > SALESMAN_SALE_VOUCHER_SYNC_MAX) {
            throw new BadRequestException(
                `At most ${SALESMAN_SALE_VOUCHER_SYNC_MAX} sale vouchers are allowed per sync`,
            );
        }

        const paymentProofsByIndex = this.extractPaymentProofs(files, dto.vouchers.length);
        const rows = this.buildSaleVoucherSyncRows(dto, paymentProofsByIndex);
        const fileName = `salesman-sale-voucher-sync-${new Date().toISOString()}`;

        const job = this.tenantJobService.createJob({
            tenantCode,
            jobType: 'SALESMAN_SALE_VOUCHER_SYNC',
            fileName,
            createdBy: user.userId,
            totalRows: rows.length,
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_STARTED',
            description: `Salesman sale voucher sync started (${rows.length} vouchers)`,
            metadata: {
                jobId: job.id,
                jobType: job.jobType,
                fileName,
                totalRows: rows.length,
            },
        });

        void this.processCreateSaleVouchersJob(tenantDb, job.id, rows, user, tenantCode).catch(
            async (error) => {
                this.tenantJobService.failJob(job.id);
                this.tenantJobService.appendLog(job.id, {
                    row: 0,
                    name: '',
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown processing failure',
                });

                const failedJob = this.tenantJobService.getJobById(job.id, tenantCode, user.userId);

                await this.activityLogService.recordActivityLog(tenantDb, {
                    actorId: user.userId,
                    action: 'TENANT_JOB_FAILED',
                    description: 'Salesman sale voucher sync failed',
                    metadata: {
                        jobId: job.id,
                        jobType: job.jobType,
                        fileName,
                        error: error instanceof Error ? error.message : String(error),
                    },
                });

                await this.notifySaleVoucherSyncCompletion(
                    tenantDb,
                    failedJob,
                    user,
                    tenantCode,
                    'failed',
                );
            },
        );

        return {
            message: 'Sale voucher sync started',
            jobId: job.id,
            status: job.status,
            totalRows: job.totalRows,
        };
    }

    private buildRetailerInventorySyncRows(
        dto: BulkSyncRetailerInventoryDto,
    ): RetailerInventorySyncRow[] {
        return dto.inventories.map((item, index) => ({
            row: index + 1,
            item,
        }));
    }

    private retailerInventoryRowLabel(
        item: SyncRetailerInventoryItemDto,
        row: number,
    ): string {
        return item.retailerId
            ? `Retailer ${item.retailerId}`
            : `Row ${row}`;
    }

    private async notifyRetailerInventorySyncCompletion(
        tenantDb: DataSource,
        job: TenantJob,
        user: { userId: string },
        tenantCode: string,
        status: 'completed' | 'failed',
    ) {
        const title =
            status === 'completed'
                ? 'Retailer inventory sync completed'
                : 'Retailer inventory sync failed';
        const message =
            status === 'completed'
                ? `Sync finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
                : 'Retailer inventory sync failed. Please review sync logs.';

        await this.notificationService.createNotification(
            tenantDb,
            {
                userId: user.userId,
                title,
                message,
                type: 'salesman_retailer_inventory_sync',
            },
            tenantCode,
            {
                job: {
                    id: job.id,
                    jobType: job.jobType,
                    status,
                    fileName: job.fileName,
                    totalRows: job.totalRows,
                    inserted: job.inserted,
                    failed: job.failed,
                    completedAt: job.completedAt,
                    logs: job.logs,
                },
            },
        );
    }

    private async processSyncRetailerInventoriesJob(
        tenantDb: DataSource,
        jobId: string,
        rows: RetailerInventorySyncRow[],
        user: { userId: string },
        tenantCode: string,
    ) {
        this.tenantJobService.startJob(jobId);

        for (const row of rows) {
            const label = this.retailerInventoryRowLabel(row.item, row.row);

            try {
                const result = await this.retailerInventoryService.syncItem(
                    tenantDb,
                    row.item,
                );

                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: label,
                    status: 'success',
                    metadata: {
                        action: result.action,
                        inventoryId: result.inventoryId,
                        retailerId: row.item.retailerId,
                        productId: row.item.productId,
                        productFlavourId: row.item.productFlavourId,
                        uomId: row.item.uomId,
                    },
                });
            } catch (error) {
                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: label,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        const completedJob = this.tenantJobService.completeJob(jobId);

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_COMPLETED',
            description: `Salesman retailer inventory sync completed for ${completedJob.fileName}`,
            metadata: {
                jobId: completedJob.id,
                jobType: completedJob.jobType,
                fileName: completedJob.fileName,
                totalRows: completedJob.totalRows,
                inserted: completedJob.inserted,
                failed: completedJob.failed,
            },
        });

        await this.notifyRetailerInventorySyncCompletion(
            tenantDb,
            completedJob,
            user,
            tenantCode,
            'completed',
        );
    }

    async syncRetailerInventories(
        tenantDb: DataSource,
        dto: BulkSyncRetailerInventoryDto,
        user: { userId: string },
        tenantCode: string,
    ) {
        if (!dto.inventories?.length) {
            throw new BadRequestException(
                'At least one retailer inventory item is required',
            );
        }

        if (dto.inventories.length > SALESMAN_RETAILER_INVENTORY_SYNC_MAX) {
            throw new BadRequestException(
                `At most ${SALESMAN_RETAILER_INVENTORY_SYNC_MAX} inventory items are allowed per sync`,
            );
        }

        const rows = this.buildRetailerInventorySyncRows(dto);
        const fileName = `salesman-retailer-inventory-sync-${new Date().toISOString()}`;

        const job = this.tenantJobService.createJob({
            tenantCode,
            jobType: 'SALESMAN_RETAILER_INVENTORY_SYNC',
            fileName,
            createdBy: user.userId,
            totalRows: rows.length,
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_STARTED',
            description: `Salesman retailer inventory sync started (${rows.length} items)`,
            metadata: {
                jobId: job.id,
                jobType: job.jobType,
                fileName,
                totalRows: rows.length,
            },
        });

        void this.processSyncRetailerInventoriesJob(
            tenantDb,
            job.id,
            rows,
            user,
            tenantCode,
        ).catch(async (error) => {
            this.tenantJobService.failJob(job.id);
            this.tenantJobService.appendLog(job.id, {
                row: 0,
                name: '',
                status: 'error',
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown processing failure',
            });

            const failedJob = this.tenantJobService.getJobById(
                job.id,
                tenantCode,
                user.userId,
            );

            await this.activityLogService.recordActivityLog(tenantDb, {
                actorId: user.userId,
                action: 'TENANT_JOB_FAILED',
                description: 'Salesman retailer inventory sync failed',
                metadata: {
                    jobId: job.id,
                    jobType: job.jobType,
                    fileName,
                    error: error instanceof Error ? error.message : String(error),
                },
            });

            await this.notifyRetailerInventorySyncCompletion(
                tenantDb,
                failedJob,
                user,
                tenantCode,
                'failed',
            );
        });

        return {
            message: 'Retailer inventory sync started',
            jobId: job.id,
            status: job.status,
            totalRows: job.totalRows,
        };
    }
}
