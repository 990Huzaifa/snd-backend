import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { S3Service } from 'src/common/s3/s3.service';
import {
  Retailer,
  RetailerVisit,
  RetailerVisitStatus,
} from 'src/tenant-db/entities/retailer.entity';
import { ActivityLogService } from '../activity-log.service';
import { CreateRetailerVisitDto } from '../../dto/salesman-app/retailer-visit/create-retailer-visit.dto';
import { ListRetailerVisitDto } from '../../dto/salesman-app/retailer-visit/list-retailer-visit.dto';
import {
  SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES,
  SALESMAN_VISIT_IMAGE_MAX_BYTES,
  SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD,
} from '../../config/salesman-visit-image.multer';

type VisitImageFiles = {
  shopImages?: Express.Multer.File[];
  shelfImages?: Express.Multer.File[];
};

@Injectable()
export class RetailerVisitService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly s3Service: S3Service,
  ) {}

  private normalizePage(value?: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  private normalizeLimit(value?: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) {
      return 10;
    }
    return Math.min(Math.floor(n), 100);
  }

  private parseOptionalDayBoundary(iso?: string): Date | undefined {
    if (!iso?.trim()) {
      return undefined;
    }
    const d = new Date(iso.trim());
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${iso}`);
    }
    return d;
  }

  private assertVisitImageFile(
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

  private assertImageFileList(
    files: Express.Multer.File[] | undefined,
    fieldName: string,
  ): Express.Multer.File[] {
    if (!files?.length) {
      return [];
    }
    if (files.length > SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD) {
      throw new BadRequestException(
        `${fieldName} allows at most ${SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD} files`,
      );
    }
    for (const file of files) {
      this.assertVisitImageFile(file, fieldName);
    }
    return files;
  }

  private async uploadVisitImages(
    tenantCode: string,
    visitId: string,
    folder: 'shop' | 'shelf',
    files: Express.Multer.File[],
  ): Promise<string[]> {
    const urls: string[] = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const extension = this.imageExtension(file.mimetype);
      const key = `tenants/${tenantCode}/retailer-visits/${visitId}/${folder}/${index}.${extension}`;
      const { url } = await this.s3Service.uploadObject(
        key,
        file.buffer,
        file.mimetype,
      );
      urls.push(url);
    }
    return urls;
  }

  async createVisit(
    tenantDb: DataSource,
    tenantCode: string,
    dto: CreateRetailerVisitDto,
    files: VisitImageFiles | undefined,
    user: { userId: string },
  ) {
    const retailer = await tenantDb.getRepository(Retailer).findOne({
      where: { id: dto.retailerId },
      select: ['id', 'routeId'],
    });
    if (!retailer) {
      throw new NotFoundException('Retailer not found');
    }

    const shopFiles = this.assertImageFileList(files?.shopImages, 'shopImages');
    const shelfFiles = this.assertImageFileList(files?.shelfImages, 'shelfImages');

    const visitId = randomUUID();
    const [shopImageUrls, shelfImageUrls] = await Promise.all([
      this.uploadVisitImages(tenantCode, visitId, 'shop', shopFiles),
      this.uploadVisitImages(tenantCode, visitId, 'shelf', shelfFiles),
    ]);

    const visitRepo = tenantDb.getRepository(RetailerVisit);
    const visit = await visitRepo.save(
      visitRepo.create({
        userId: user.userId,
        retailerId: dto.retailerId,
        routeId: retailer.routeId,
        visitStatus: dto.visitStatus,
        notes: dto.notes?.trim() || null,
        shopImages: shopImageUrls.length ? shopImageUrls : null,
        shelfImages: shelfImageUrls.length ? shelfImageUrls : null,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_VISIT_CREATED',
      description: 'Retailer visit created',
      metadata: {
        retailerVisitId: visit.id,
        retailerId: visit.retailerId,
        visitStatus: visit.visitStatus,
      },
    });

    return this.viewVisit(tenantDb, visit.id, user, { recordActivityLog: false });
  }

  async listHistory(
    tenantDb: DataSource,
    filters: ListRetailerVisitDto,
    user: { userId: string },
  ) {
    const page = this.normalizePage(filters.page);
    const limit = this.normalizeLimit(filters.limit);
    const dateFrom = this.parseOptionalDayBoundary(filters.dateFrom);
    const dateTo = this.parseOptionalDayBoundary(filters.dateTo);

    const qb = tenantDb
      .getRepository(RetailerVisit)
      .createQueryBuilder('rv')
      .leftJoinAndSelect('rv.retailer', 'retailer')
      .where('rv."userId" = :userId', { userId: user.userId });

    if (filters.retailerId) {
      qb.andWhere('rv."retailerId" = :retailerId', {
        retailerId: filters.retailerId,
      });
    }

    if (filters.visitStatus) {
      qb.andWhere('rv."visitStatus" = :visitStatus', {
        visitStatus: filters.visitStatus,
      });
    }

    const search = (filters.search ?? '').trim();
    if (search) {
      qb.andWhere('retailer."shopName" ILIKE :search', {
        search: `%${search}%`,
      });
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    if (dateFrom) {
      qb.andWhere('rv."createdAt" >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('rv."createdAt" <= :dateTo', { dateTo: end });
    }

    const total = await qb.clone().getCount();

    const rows = await qb
      .clone()
      .select([
        'rv.id',
        'rv.visitStatus',
        'rv.checkInLatitude',
        'rv.checkInLongitude',
        'rv.notes',
        'rv.shopImages',
        'rv.shelfImages',
        'rv.createdAt',
        'retailer.id',
        'retailer.shopName',
      ])
      .orderBy('rv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_VISIT_LISTED',
      description: 'Retailer visit history listed',
      metadata: { total, page, limit },
    });

    return {
      result: rows,
      meta: { total, page, limit },
    };
  }

  async viewVisit(
    tenantDb: DataSource,
    id: string,
    user: { userId: string },
    options?: { recordActivityLog?: boolean },
  ) {
    const visit = await tenantDb.getRepository(RetailerVisit).findOne({
      where: { id },
      relations: ['retailer', 'route', 'user'],
    });

    if (!visit) {
      throw new NotFoundException('Retailer visit not found');
    }

    if (visit.userId !== user.userId) {
      throw new ForbiddenException('Not allowed to view this retailer visit');
    }

    if (options?.recordActivityLog !== false) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'RETAILER_VISIT_VIEWED',
        description: 'Retailer visit viewed',
        metadata: { retailerVisitId: visit.id },
      });
    }

    return visit;
  }
}
