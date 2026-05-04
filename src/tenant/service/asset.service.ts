import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { S3Service } from 'src/common/s3/s3.service';
import { Asset, AssetStatus } from 'src/tenant-db/entities/asset.entity';
import { Product } from 'src/tenant-db/entities/product.entity';
import { Retailer } from 'src/tenant-db/entities/retailer.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { DataSource, EntityManager } from 'typeorm';
import { basename, extname } from 'path';
import { randomUUID } from 'crypto';
import {
    ASSET_RULES,
    AssetEntityType,
    AssetPurpose,
} from '../config/asset-rules.config';
import { CreateAssetUploadRequestDto } from '../dto/asset/create-asset-upload-request.dto';
import { ConfirmAssetUploadDto } from '../dto/asset/confirm-asset-upload.dto';

const PRESIGNED_PUT_EXPIRES_SEC = 15 * 60;

const PERM_UPDATE_PRODUCT = 'UPDATE_PRODUCT';
const PERM_UPDATE_RETAILER = 'UPDATE_RETAILER';
const PERM_UPDATE_USER = 'UPDATE_USER';

const MIME_TO_EXTENSION: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

export type AssetUploadRequestItemResult = {
    assetId: string;
    preSignedUploadUrl: string;
    s3Key: string;
    expiresInSeconds: number;
    contentType: string;
};

export type ConfirmAssetUploadItemResult = {
    assetId: string;
    status: AssetStatus;
};

@Injectable()
export class AssetService {
    constructor(private readonly s3Service: S3Service) { }

    async createUploadRequests(
        tenantDb: DataSource,
        tenantId: string,
        dto: CreateAssetUploadRequestDto,
        user: any,
    ): Promise<{ uploads: AssetUploadRequestItemResult[] }> {
        const rules = ASSET_RULES[dto.purpose];
        if (!rules) {
            throw new BadRequestException('Unsupported asset purpose');
        }

        if (dto.files.length > rules.maxFiles) {
            throw new BadRequestException(
                `At most ${rules.maxFiles} file(s) allowed for purpose ${dto.purpose}`,
            );
        }

        if (dto.entityId) {
            if (!dto.entityType) {
                throw new BadRequestException(
                    'entityType is required when entityId is provided',
                );
            }
        }

        if (dto.entityType !== undefined) {
            const allowedEntityTypes = rules.allowedEntityTypes as readonly string[];
            if (!allowedEntityTypes.includes(dto.entityType)) {
                throw new BadRequestException(
                    `entityType ${dto.entityType} is not allowed for purpose ${dto.purpose}`,
                );
            }
        }

        const allowedMimeTypes = rules.allowedMimeTypes as readonly string[];
        for (const file of dto.files) {
            if (!allowedMimeTypes.includes(file.mimeType)) {
                throw new BadRequestException(
                    `MIME type ${file.mimeType} is not allowed for purpose ${dto.purpose}`,
                );
            }
            if (file.fileSize > rules.maxSizeBytes) {
                throw new BadRequestException(
                    `File ${file.originalFileName} exceeds maximum size of ${rules.maxSizeBytes} bytes`,
                );
            }
        }

        const repo = tenantDb.getRepository(Asset);
        const uploads: AssetUploadRequestItemResult[] = [];

        for (const file of dto.files) {
            const assetId = randomUUID();
            const extension = this.resolveSafeExtension(file.originalFileName, file.mimeType);
            const s3Key = `tenants/${tenantId}/temp/uploads/${assetId}.${extension}`;

            const asset = repo.create({
                id: assetId,
                uploadedById: user.userId,
                purpose: dto.purpose,
                s3Key,
                entityType: dto.entityType ?? null,
                entityId: dto.entityId ?? null,
                originalFileName: this.sanitizeOriginalFileName(file.originalFileName),
                fileExtension: extension,
                fileSize: file.fileSize,
                status: AssetStatus.PENDING,
                confirmedAt: null,
                attachedAt: null,
            });

            await repo.save(asset);

            try {
                const preSignedUploadUrl = await this.s3Service.getPresignedPutObjectUrl(
                    s3Key,
                    file.mimeType,
                    PRESIGNED_PUT_EXPIRES_SEC,
                );
                uploads.push({
                    assetId,
                    preSignedUploadUrl,
                    s3Key,
                    expiresInSeconds: PRESIGNED_PUT_EXPIRES_SEC,
                    contentType: file.mimeType,
                });
            } catch (err) {
                await repo.delete({ id: assetId });
                throw err;
            }
        }

        return { uploads };
    }

    async confirmUploads(
        tenantDb: DataSource,
        tenantId: string,
        dto: ConfirmAssetUploadDto,
        user: any,
    ): Promise<{ results: ConfirmAssetUploadItemResult[] }> {
        const repo = tenantDb.getRepository(Asset);
        const results: ConfirmAssetUploadItemResult[] = [];

        for (const assetId of dto.assetIds) {
            const asset = await repo.findOne({ where: { id: assetId } });
            if (!asset) {
                throw new NotFoundException(`Asset ${assetId} not found`);
            }

            if (asset.uploadedById !== user.userId) {
                throw new ForbiddenException(`Not allowed to confirm asset ${assetId}`);
            }

            if (asset.status !== AssetStatus.PENDING) {
                throw new BadRequestException(
                    `Asset ${assetId} is not pending confirmation (status: ${asset.status})`,
                );
            }

            const expectedPrefix = `tenants/${tenantId}/temp/uploads/${asset.id}.`;
            if (!asset.s3Key.startsWith(expectedPrefix)) {
                throw new BadRequestException(`Asset ${assetId} has an unexpected storage key`);
            }

            const rules = ASSET_RULES[asset.purpose as AssetPurpose];
            if (!rules) {
                throw new BadRequestException(`Unknown purpose on asset ${assetId}`);
            }

            if (asset.entityId && !asset.entityType) {
                throw new BadRequestException(
                    `Asset ${assetId} has entityId but no entityType; cannot attach`,
                );
            }
            if (!asset.entityId && asset.entityType) {
                throw new BadRequestException(
                    `Asset ${assetId} has entityType but no entityId; cannot attach`,
                );
            }
            if (asset.entityId && asset.entityType) {
                const allowed = rules.allowedEntityTypes as readonly string[];
                if (!allowed.includes(asset.entityType)) {
                    throw new BadRequestException(
                        `entityType ${asset.entityType} does not match purpose ${asset.purpose}`,
                    );
                }
            }

            let head;
            try {
                head = await this.s3Service.headObject(asset.s3Key);
            } catch (err: unknown) {
                const statusCode =
                    err && typeof err === 'object' && '$metadata' in err
                        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
                            ?.httpStatusCode
                        : undefined;
                const name =
                    err && typeof err === 'object' && 'name' in err
                        ? String((err as { name: string }).name)
                        : '';
                if (statusCode === 404 || name === 'NotFound') {
                    throw new BadRequestException(
                        `Object for asset ${assetId} was not found in storage; upload may have failed`,
                    );
                }
                throw err;
            }

            const contentLength = head.ContentLength ?? 0;
            if (contentLength !== asset.fileSize) {
                throw new BadRequestException(
                    `Stored size for asset ${assetId} does not match declared size`,
                );
            }

            if (
                head.ContentType &&
                !(rules.allowedMimeTypes as readonly string[]).includes(head.ContentType)
            ) {
                throw new BadRequestException(
                    `Stored content type for asset ${assetId} is not allowed for its purpose`,
                );
            }

            const imageUrl = this.s3Service.getObjectUrl(asset.s3Key);

            await this.assetCanAttachToEntity(tenantDb, user, asset);

            await tenantDb.transaction(async (manager) => {
                await this.confirmAssetAndAttachInTransaction(
                    manager,
                    asset.id,
                    imageUrl,
                    user,
                );
            });

            results.push({ assetId: asset.id, status: AssetStatus.APPROVED });
        }

        return { results };
    }

    private async assetCanAttachToEntity(
        tenantDb: DataSource,
        user: any,
        asset: Asset,
    ): Promise<void> {
        if (!asset.entityId || !asset.entityType) {
            return;
        }

        const jwtRole = user.role?.toUpperCase();
        if (jwtRole === 'SUPER_ADMIN') {
            return;
        }

        const perm = await this.getUserPermissionSet(tenantDb, user.userId);
        if (perm === 'ALL') {
            return;
        }

        switch (asset.entityType as AssetEntityType) {
            case AssetEntityType.PRODUCT:
                if (!perm.has(PERM_UPDATE_PRODUCT)) {
                    throw new ForbiddenException(
                        `Missing permission ${PERM_UPDATE_PRODUCT} to attach to this product`,
                    );
                }
                return;
            case AssetEntityType.RETAILER:
                if (!perm.has(PERM_UPDATE_RETAILER)) {
                    throw new ForbiddenException(
                        `Missing permission ${PERM_UPDATE_RETAILER} to attach to this retailer`,
                    );
                }
                return;
            case AssetEntityType.USER:
                if (asset.entityId === user.userId) {
                    return;
                }
                if (!perm.has(PERM_UPDATE_USER)) {
                    throw new ForbiddenException(
                        `Missing permission ${PERM_UPDATE_USER} to update another user's avatar`,
                    );
                }
                return;
            case AssetEntityType.SHOP_VISIT:
            case AssetEntityType.SHOP_MERCHANDISE:
                throw new BadRequestException(
                    'Attaching shop images to an entity column is not supported yet',
                );
            default:
                throw new BadRequestException(`Unknown entityType ${asset.entityType}`);
        }
    }

    private async getUserPermissionSet(
        tenantDb: DataSource,
        userId: string,
    ): Promise<Set<string> | 'ALL'> {
        const tenantUser = await tenantDb.getRepository(User).findOne({
            where: { id: userId },
            relations: ['role', 'role.permissions'],
        });
        if (!tenantUser?.role) {
            return new Set();
        }
        if (tenantUser.role.code?.toUpperCase() === 'SUPER_ADMIN') {
            return 'ALL';
        }
        const codes = (tenantUser.role.permissions ?? []).map((p) => p.code.toUpperCase());
        return new Set(codes);
    }

    private async confirmAssetAndAttachInTransaction(
        manager: EntityManager,
        assetId: string,
        imageUrl: string,
        user: any,
    ): Promise<void> {
        const assetRepo = manager.getRepository(Asset);
        const fresh = await assetRepo.findOne({
            where: { id: assetId, status: AssetStatus.PENDING },
        });
        if (!fresh) {
            throw new BadRequestException(`Asset ${assetId} is no longer pending`);
        }

        let attachedAt: Date | null = null;

        if (fresh.entityId && fresh.entityType) {
            await this.attachImageToEntity(manager, fresh, imageUrl, user);
            attachedAt = new Date();
        }

        fresh.status = AssetStatus.APPROVED;
        fresh.confirmedAt = new Date();
        if (attachedAt) {
            fresh.attachedAt = attachedAt;
        }
        await assetRepo.save(fresh);
    }

    private async attachImageToEntity(
        manager: EntityManager,
        asset: Asset,
        imageUrl: string,
        user: any,
    ): Promise<void> {
        switch (asset.entityType as AssetEntityType) {
            case AssetEntityType.PRODUCT: {
                const productRepo = manager.getRepository(Product);
                const product = await productRepo.findOne({
                    where: { id: asset.entityId!, isDelete: false },
                });
                if (!product) {
                    throw new NotFoundException('Product not found');
                }
                product.image = this.mergeCommaSeparatedImage(product.image, imageUrl);
                await productRepo.save(product);
                return;
            }
            case AssetEntityType.RETAILER: {
                const retailerRepo = manager.getRepository(Retailer);
                const retailer = await retailerRepo.findOne({
                    where: { id: asset.entityId! },
                });
                if (!retailer) {
                    throw new NotFoundException('Retailer not found');
                }
                retailer.image = this.mergeCommaSeparatedImage(retailer.image, imageUrl);
                await retailerRepo.save(retailer);
                return;
            }
            case AssetEntityType.USER: {
                if (asset.purpose !== AssetPurpose.USER_AVATAR) {
                    throw new BadRequestException('USER entityType requires USER_AVATAR purpose');
                }
                const userRepo = manager.getRepository(User);
                const targetUser = await userRepo.findOne({
                    where: { id: asset.entityId!, isDeleted: false },
                });
                if (!targetUser) {
                    throw new NotFoundException('User not found');
                }
                targetUser.avatar = imageUrl;
                await userRepo.save(targetUser);
                return;
            }
            case AssetEntityType.SHOP_VISIT:
            case AssetEntityType.SHOP_MERCHANDISE:
                throw new BadRequestException(
                    'Attaching shop images to an entity column is not supported yet',
                );
            default:
                throw new BadRequestException(`Unknown entityType ${asset.entityType}`);
        }
    }

    private mergeCommaSeparatedImage(
        existing: string | null | undefined,
        url: string,
    ): string {
        const parts = (existing ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.includes(url)) {
            return parts.join(',');
        }
        return parts.length ? `${parts.join(',')},${url}` : url;
    }

    private sanitizeOriginalFileName(name: string): string {
        const base = basename(name).trim();
        return base.length > 0 ? base.slice(0, 512) : 'unnamed';
    }

    private resolveSafeExtension(originalFileName: string, mimeType: string): string {
        const fromMime = MIME_TO_EXTENSION[mimeType];
        if (!fromMime) {
            throw new BadRequestException('Could not map MIME type to an extension');
        }

        let ext = extname(originalFileName).toLowerCase().replace(/^\./, '');
        if (ext === 'jpeg') {
            ext = 'jpg';
        }

        const allowedForMime: Record<string, string[]> = {
            'image/jpeg': ['jpg', 'jpeg'],
            'image/png': ['png'],
            'image/webp': ['webp'],
        };
        const names = allowedForMime[mimeType];
        if (!names) {
            throw new BadRequestException('Unsupported MIME type for extension resolution');
        }

        if (ext && names.includes(ext)) {
            return ext;
        }

        return fromMime;
    }
}
