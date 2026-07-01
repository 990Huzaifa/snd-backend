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

@Injectable()
export class SalesmanSyncUpService {
    constructor(
        private readonly activityLogService: ActivityLogService,
        private readonly notificationService: NotificationService,
        private readonly tenantJobService: TenantJobService,
        private readonly s3Service: S3Service,
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
}
