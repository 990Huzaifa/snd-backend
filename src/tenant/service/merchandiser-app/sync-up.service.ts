import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { S3Service } from 'src/common/s3/s3.service';
import {
    Retailer,
    RetailerMerchandising,
} from 'src/tenant-db/entities/retailer.entity';
import {
    MERCHANDISER_BULK_MERCHANDISING_MAX,
} from '../../config/merchandiser-merchandising-image.multer';
import {
    SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES,
    SALESMAN_VISIT_IMAGE_MAX_BYTES,
    SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD,
} from '../../config/salesman-visit-image.multer';
import {
    BulkCreateRetailerMerchandisingDto,
    CreateRetailerMerchandisingItemDto,
} from '../../dto/merchandiser-app/retailer-merchandising/bulk-create-retailer-merchandising.dto';
import { ActivityLogService } from '../activity-log.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';

type ShelfImagePayload = {
    buffer: Buffer;
    mimetype: string;
};

type MerchandisingSyncRow = {
    row: number;
    entry: CreateRetailerMerchandisingItemDto;
    shelfImages: ShelfImagePayload[];
};

@Injectable()
export class MerchandiserSyncUpService {
    constructor(
        private readonly activityLogService: ActivityLogService,
        private readonly notificationService: NotificationService,
        private readonly tenantJobService: TenantJobService,
        private readonly s3Service: S3Service,
    ) { }

    private assertShelfImageFile(
        file: Express.Multer.File,
        fieldName: string,
    ): void {
        if (
            !SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES.includes(
                file.mimetype as (typeof SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES)[number],
            )
        ) {
            throw new BadRequestException(
                `${fieldName} must be a PNG, JPEG, or WebP image`,
            );
        }
        if (!file.buffer?.length) {
            throw new BadRequestException(`${fieldName} file is empty`);
        }
        if (file.size > SALESMAN_VISIT_IMAGE_MAX_BYTES) {
            throw new BadRequestException(
                `${fieldName} must not exceed ${SALESMAN_VISIT_IMAGE_MAX_BYTES} bytes`,
            );
        }
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

    private async uploadShelfImages(
        tenantCode: string,
        merchandisingId: string,
        images: ShelfImagePayload[],
    ): Promise<string[]> {
        const urls: string[] = [];
        for (let index = 0; index < images.length; index++) {
            const image = images[index];
            const extension = this.imageExtension(image.mimetype);
            const key = `tenants/${tenantCode}/retailer-merchandising/${merchandisingId}/shelf/${index}.${extension}`;
            const { url } = await this.s3Service.uploadObject(
                key,
                image.buffer,
                image.mimetype,
            );
            urls.push(url);
        }
        return urls;
    }

    private parseShelfImageField(
        fieldname: string,
        entryCount: number,
    ): number | null {
        const bracketMatch = fieldname.match(/^shelfImages\[(\d+)\]$/);
        if (bracketMatch) {
            return Number(bracketMatch[1]);
        }

        const underscoreMatch = fieldname.match(/^shelfImages_(\d+)$/);
        if (underscoreMatch) {
            return Number(underscoreMatch[1]);
        }

        if (entryCount === 1 && fieldname === 'shelfImages') {
            return 0;
        }

        return null;
    }

    private extractShelfImages(
        files: Express.Multer.File[] | undefined,
        entryCount: number,
    ): Map<number, ShelfImagePayload[]> {
        const imagesByIndex = new Map<number, ShelfImagePayload[]>();
        if (!files?.length) {
            return imagesByIndex;
        }

        for (const file of files) {
            const entryIndex = this.parseShelfImageField(file.fieldname, entryCount);
            if (entryIndex === null) {
                continue;
            }

            if (entryIndex < 0 || entryIndex >= entryCount) {
                throw new BadRequestException(
                    `Image field ${file.fieldname} does not match any entry index`,
                );
            }

            this.assertShelfImageFile(file, file.fieldname);

            const existing = imagesByIndex.get(entryIndex) ?? [];
            if (existing.length >= SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD) {
                throw new BadRequestException(
                    `${file.fieldname} allows at most ${SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD} files per entry`,
                );
            }

            existing.push({
                buffer: file.buffer,
                mimetype: file.mimetype,
            });
            imagesByIndex.set(entryIndex, existing);
        }

        return imagesByIndex;
    }

    private buildMerchandisingRows(
        dto: BulkCreateRetailerMerchandisingDto,
        imagesByIndex: Map<number, ShelfImagePayload[]>,
    ): MerchandisingSyncRow[] {
        return dto.entries.map((entry, index) => ({
            row: index + 1,
            entry,
            shelfImages: imagesByIndex.get(index) ?? [],
        }));
    }

    private merchandisingRowLabel(
        entry: CreateRetailerMerchandisingItemDto,
        row: number,
    ): string {
        return entry.retailerId ? `Retailer ${entry.retailerId}` : `Row ${row}`;
    }

    private async notifyMerchandisingSyncCompletion(
        tenantDb: DataSource,
        job: TenantJob,
        user: { userId: string },
        tenantCode: string,
        status: 'completed' | 'failed',
    ) {
        const title =
            status === 'completed'
                ? 'Retailer merchandising sync completed'
                : 'Retailer merchandising sync failed';
        const message =
            status === 'completed'
                ? `Sync finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
                : 'Retailer merchandising sync failed. Please review sync logs.';

        await this.notificationService.createNotification(
            tenantDb,
            {
                userId: user.userId,
                title,
                message,
                type: 'merchandiser_retailer_merchandising_sync',
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

    private async buildMerchandisingEntity(
        row: MerchandisingSyncRow,
        userId: string,
        tenantCode: string,
    ): Promise<Partial<RetailerMerchandising>> {
        const merchandisingId = randomUUID();
        const shelfImageUrls = await this.uploadShelfImages(
            tenantCode,
            merchandisingId,
            row.shelfImages,
        );

        return {
            id: merchandisingId,
            userId,
            retailerId: row.entry.retailerId,
            notes: row.entry.notes?.trim() || null,
            shelfImages: shelfImageUrls.length ? shelfImageUrls : null,
        };
    }

    private async processCreateRetailerMerchandisingJob(
        tenantDb: DataSource,
        jobId: string,
        rows: MerchandisingSyncRow[],
        user: { userId: string },
        tenantCode: string,
    ) {
        this.tenantJobService.startJob(jobId);

        const retailerIds = [...new Set(rows.map((row) => row.entry.retailerId))];
        const retailers = await tenantDb.getRepository(Retailer).find({
            where: { id: In(retailerIds) },
            select: ['id', 'shopName'],
        });
        const retailerById = new Map(retailers.map((retailer) => [retailer.id, retailer]));

        const merchandisingRepo = tenantDb.getRepository(RetailerMerchandising);
        const validRows: Array<{
            row: MerchandisingSyncRow;
            entity: Partial<RetailerMerchandising>;
            label: string;
        }> = [];

        for (const row of rows) {
            const retailer = retailerById.get(row.entry.retailerId);
            const label = retailer?.shopName?.trim() || this.merchandisingRowLabel(row.entry, row.row);

            if (!retailer) {
                this.tenantJobService.appendLog(jobId, {
                    row: row.row,
                    name: label,
                    status: 'error',
                    error: 'Retailer not found',
                });
                continue;
            }

            try {
                validRows.push({
                    row,
                    label,
                    entity: await this.buildMerchandisingEntity(row, user.userId, tenantCode),
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

        if (validRows.length) {
            try {
                const saved = await merchandisingRepo.save(
                    validRows.map((item) => merchandisingRepo.create(item.entity)),
                );

                saved.forEach((merchandising, index) => {
                    const source = validRows[index];
                    this.tenantJobService.appendLog(jobId, {
                        row: source.row.row,
                        name: source.label,
                        status: 'success',
                        metadata: {
                            retailerMerchandisingId: merchandising.id,
                            retailerId: merchandising.retailerId,
                        },
                    });
                });
            } catch {
                for (const item of validRows) {
                    try {
                        const merchandising = await merchandisingRepo.save(
                            merchandisingRepo.create(item.entity),
                        );
                        this.tenantJobService.appendLog(jobId, {
                            row: item.row.row,
                            name: item.label,
                            status: 'success',
                            metadata: {
                                retailerMerchandisingId: merchandising.id,
                                retailerId: merchandising.retailerId,
                            },
                        });
                    } catch (error) {
                        this.tenantJobService.appendLog(jobId, {
                            row: item.row.row,
                            name: item.label,
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
            description: `Merchandiser retailer merchandising sync completed for ${completedJob.fileName}`,
            metadata: {
                jobId: completedJob.id,
                jobType: completedJob.jobType,
                fileName: completedJob.fileName,
                totalRows: completedJob.totalRows,
                inserted: completedJob.inserted,
                failed: completedJob.failed,
            },
        });

        await this.notifyMerchandisingSyncCompletion(
            tenantDb,
            completedJob,
            user,
            tenantCode,
            'completed',
        );
    }

    async createRetailerMerchandising(
        tenantDb: DataSource,
        dto: BulkCreateRetailerMerchandisingDto,
        files: Express.Multer.File[] | undefined,
        user: { userId: string },
        tenantCode: string,
    ) {
        if (!dto.entries?.length) {
            throw new BadRequestException('At least one merchandising entry is required');
        }

        if (dto.entries.length > MERCHANDISER_BULK_MERCHANDISING_MAX) {
            throw new BadRequestException(
                `At most ${MERCHANDISER_BULK_MERCHANDISING_MAX} merchandising entries are allowed per sync`,
            );
        }

        const imagesByIndex = this.extractShelfImages(files, dto.entries.length);
        const rows = this.buildMerchandisingRows(dto, imagesByIndex);
        const fileName = `merchandiser-retailer-merchandising-sync-${new Date().toISOString()}`;

        const job = this.tenantJobService.createJob({
            tenantCode,
            jobType: 'MERCHANDISER_RETAILER_MERCHANDISING_SYNC',
            fileName,
            createdBy: user.userId,
            totalRows: rows.length,
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TENANT_JOB_STARTED',
            description: `Merchandiser retailer merchandising sync started (${rows.length} records)`,
            metadata: {
                jobId: job.id,
                jobType: job.jobType,
                fileName,
                totalRows: rows.length,
            },
        });

        void this.processCreateRetailerMerchandisingJob(
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
                error: error instanceof Error ? error.message : 'Unknown processing failure',
            });

            const failedJob = this.tenantJobService.getJobById(
                job.id,
                tenantCode,
                user.userId,
            );

            await this.activityLogService.recordActivityLog(tenantDb, {
                actorId: user.userId,
                action: 'TENANT_JOB_FAILED',
                description: 'Merchandiser retailer merchandising sync failed',
                metadata: {
                    jobId: job.id,
                    jobType: job.jobType,
                    fileName,
                    error: error instanceof Error ? error.message : String(error),
                },
            });

            await this.notifyMerchandisingSyncCompletion(
                tenantDb,
                failedJob,
                user,
                tenantCode,
                'failed',
            );
        });

        return {
            message: 'Retailer merchandising sync started',
            jobId: job.id,
            status: job.status,
            totalRows: job.totalRows,
        };
    }
}
