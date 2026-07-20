import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import {
  isWithinRadiusKm,
  parseGeoCoordinate,
  parseMaxRadiusKm,
} from 'src/common/geo/geo.util';
import { S3Service } from 'src/common/s3/s3.service';
import {
  Attendence,
  TrackingLog,
} from 'src/tenant-db/entities/attendence.entity';
import {
  Retailer,
  RetailerAttendence,
  RetailerVisit,
  RetailerVisitStatus,
} from 'src/tenant-db/entities/retailer.entity';
import { ActivityLogService } from '../activity-log.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';
import {
  BulkCheckInRetailerDto,
  CheckInRetailerItemDto,
} from '../../dto/salesman-app/retailer-visit/check-in-retailer.dto';
import {
  BulkCreateRetailerVisitDto,
  CreateRetailerVisitItemDto,
} from '../../dto/salesman-app/retailer-visit/create-retailer-visit.dto';
import { ListRetailerVisitDto } from '../../dto/salesman-app/retailer-visit/list-retailer-visit.dto';
import {
  SALESMAN_BULK_VISIT_MAX,
  SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES,
  SALESMAN_VISIT_IMAGE_MAX_BYTES,
  SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD,
} from '../../config/salesman-visit-image.multer';

const SALESMAN_BULK_CHECK_IN_MAX = 50;

type VisitImagePayload = {
  buffer: Buffer;
  mimetype: string;
};

type VisitRowImages = {
  shopImages: VisitImagePayload[];
  shelfImages: VisitImagePayload[];
};

type VisitSyncRow = {
  row: number;
  visit: CreateRetailerVisitItemDto;
  images: VisitRowImages;
};

type CheckInSyncRow = {
  row: number;
  checkIn: CheckInRetailerItemDto;
};

type CheckInTrackingEntry = {
  latitude: number;
  longitude: number;
  logTime: Date;
};

@Injectable()
export class RetailerVisitService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly s3Service: S3Service,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
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

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
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

  private async uploadVisitImages(
    tenantCode: string,
    visitId: string,
    folder: 'shop' | 'shelf',
    images: VisitImagePayload[],
  ): Promise<string[]> {
    const urls: string[] = [];
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      const extension = this.imageExtension(image.mimetype);
      const key = `tenants/${tenantCode}/retailer-visits/${visitId}/${folder}/${index}.${extension}`;
      const { url } = await this.s3Service.uploadObject(
        key,
        image.buffer,
        image.mimetype,
      );
      urls.push(url);
    }
    return urls;
  }

  private emptyVisitRowImages(): VisitRowImages {
    return { shopImages: [], shelfImages: [] };
  }

  private parseVisitImageField(
    fieldname: string,
    visitCount: number,
  ): { visitIndex: number; type: 'shop' | 'shelf' } | null {
    const patterns: Array<{
      regex: RegExp;
      type: 'shop' | 'shelf';
    }> = [
      { regex: /^shopImages\[(\d+)\]$/, type: 'shop' },
      { regex: /^shelfImages\[(\d+)\]$/, type: 'shelf' },
      { regex: /^shopImages_(\d+)$/, type: 'shop' },
      { regex: /^shelfImages_(\d+)$/, type: 'shelf' },
    ];

    for (const pattern of patterns) {
      const match = fieldname.match(pattern.regex);
      if (match) {
        return { visitIndex: Number(match[1]), type: pattern.type };
      }
    }

    if (visitCount === 1) {
      if (fieldname === 'shopImages') {
        return { visitIndex: 0, type: 'shop' };
      }
      if (fieldname === 'shelfImages') {
        return { visitIndex: 0, type: 'shelf' };
      }
    }

    return null;
  }

  private extractVisitImages(
    files: Express.Multer.File[] | undefined,
    visitCount: number,
  ): Map<number, VisitRowImages> {
    const imagesByIndex = new Map<number, VisitRowImages>();
    if (!files?.length) {
      return imagesByIndex;
    }

    for (const file of files) {
      const parsed = this.parseVisitImageField(file.fieldname, visitCount);
      if (!parsed) {
        continue;
      }

      if (parsed.visitIndex < 0 || parsed.visitIndex >= visitCount) {
        throw new BadRequestException(
          `Image field ${file.fieldname} does not match any visit index`,
        );
      }

      this.assertVisitImageFile(file, file.fieldname);

      const bucket =
        imagesByIndex.get(parsed.visitIndex) ?? this.emptyVisitRowImages();
      const target =
        parsed.type === 'shop' ? bucket.shopImages : bucket.shelfImages;

      if (target.length >= SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD) {
        throw new BadRequestException(
          `${file.fieldname} allows at most ${SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD} files per visit`,
        );
      }

      target.push({
        buffer: file.buffer,
        mimetype: file.mimetype,
      });
      imagesByIndex.set(parsed.visitIndex, bucket);
    }

    return imagesByIndex;
  }

  private buildVisitRows(
    dto: BulkCreateRetailerVisitDto,
    imagesByIndex: Map<number, VisitRowImages>,
  ): VisitSyncRow[] {
    return dto.visits.map((visit, index) => ({
      row: index + 1,
      visit,
      images: imagesByIndex.get(index) ?? this.emptyVisitRowImages(),
    }));
  }

  private async notifyVisitSyncCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Retailer visit sync completed'
        : 'Retailer visit sync failed';
    const message =
      status === 'completed'
        ? `Visit sync finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : 'Retailer visit sync failed. Please review sync logs.';

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        message,
        type: 'salesman_retailer_visit_sync',
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

  private async buildVisitEntity(
    row: VisitSyncRow,
    userId: string,
    tenantCode: string,
    routeId: string,
  ): Promise<Partial<RetailerVisit>> {
    const visitId = randomUUID();
    const [shopImageUrls, shelfImageUrls] = await Promise.all([
      this.uploadVisitImages(tenantCode, visitId, 'shop', row.images.shopImages),
      this.uploadVisitImages(tenantCode, visitId, 'shelf', row.images.shelfImages),
    ]);

    return {
      id: visitId,
      userId,
      retailerId: row.visit.retailerId,
      routeId,
      visitStatus: row.visit.visitStatus,
      notes: row.visit.notes?.trim() || null,
      shopImages: shopImageUrls.length ? shopImageUrls : null,
      shelfImages: shelfImageUrls.length ? shelfImageUrls : null,
    };
  }

  private async processBulkVisitJob(
    tenantDb: DataSource,
    jobId: string,
    rows: VisitSyncRow[],
    user: { userId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    const retailerIds = [...new Set(rows.map((row) => row.visit.retailerId))];
    const retailers = await tenantDb.getRepository(Retailer).find({
      where: { id: In(retailerIds) },
      select: ['id', 'shopName', 'routeId'],
    });
    const retailerById = new Map(retailers.map((retailer) => [retailer.id, retailer]));

    const visitRepo = tenantDb.getRepository(RetailerVisit);
    const validRows: Array<{
      row: VisitSyncRow;
      entity: Partial<RetailerVisit>;
      label: string;
    }> = [];

    for (const row of rows) {
      const retailer = retailerById.get(row.visit.retailerId);
      const label = retailer?.shopName?.trim() || row.visit.retailerId;

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
          entity: await this.buildVisitEntity(
            row,
            user.userId,
            tenantCode,
            retailer.routeId,
          ),
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
        const saved = await visitRepo.save(
          validRows.map((item) => visitRepo.create(item.entity)),
        );

        saved.forEach((visit, index) => {
          const source = validRows[index];
          this.tenantJobService.appendLog(jobId, {
            row: source.row.row,
            name: source.label,
            status: 'success',
            metadata: {
              retailerVisitId: visit.id,
              retailerId: visit.retailerId,
              visitStatus: visit.visitStatus,
            },
          });
        });
      } catch {
        for (const item of validRows) {
          try {
            const visit = await visitRepo.save(visitRepo.create(item.entity));
            this.tenantJobService.appendLog(jobId, {
              row: item.row.row,
              name: item.label,
              status: 'success',
              metadata: {
                retailerVisitId: visit.id,
                retailerId: visit.retailerId,
                visitStatus: visit.visitStatus,
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
      description: `Salesman retailer visit sync completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifyVisitSyncCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async bulkCreateVisits(
    tenantDb: DataSource,
    tenantCode: string,
    dto: BulkCreateRetailerVisitDto,
    files: Express.Multer.File[] | undefined,
    user: { userId: string },
  ) {
    if (!dto.visits?.length) {
      throw new BadRequestException('At least one visit is required');
    }

    if (dto.visits.length > SALESMAN_BULK_VISIT_MAX) {
      throw new BadRequestException(
        `At most ${SALESMAN_BULK_VISIT_MAX} visits are allowed per sync`,
      );
    }

    const imagesByIndex = this.extractVisitImages(files, dto.visits.length);
    const rows = this.buildVisitRows(dto, imagesByIndex);
    const fileName = `salesman-retailer-visit-sync-${new Date().toISOString()}`;

    const job = this.tenantJobService.createJob({
      tenantCode,
      jobType: 'SALESMAN_RETAILER_VISIT_SYNC',
      fileName,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_STARTED',
      description: `Salesman retailer visit sync started (${rows.length} records)`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName,
        totalRows: rows.length,
      },
    });

    void this.processBulkVisitJob(tenantDb, job.id, rows, user, tenantCode).catch(
      async (error) => {
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
          description: 'Salesman retailer visit sync failed',
          metadata: {
            jobId: job.id,
            jobType: job.jobType,
            fileName,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        await this.notifyVisitSyncCompletion(
          tenantDb,
          failedJob,
          user,
          tenantCode,
          'failed',
        );
      },
    );

    return {
      message: 'Retailer visit sync started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
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

  private async findTodayAttendancesForRetailers(
    tenantDb: DataSource,
    retailerIds: string[],
  ): Promise<Set<string>> {
    if (!retailerIds.length) {
      return new Set();
    }

    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const records = await tenantDb
      .getRepository(RetailerAttendence)
      .createQueryBuilder('ra')
      .select(['ra.retailerId'])
      .where('ra."retailerId" IN (:...retailerIds)', { retailerIds })
      .andWhere('ra."attendenceDate" >= :today', { today })
      .andWhere('ra."attendenceDate" < :tomorrow', { tomorrow })
      .getMany();

    return new Set(records.map((record) => record.retailerId));
  }

  private isWithinRetailerArea(
    checkLat: number,
    checkLng: number,
    retailer: Pick<Retailer, 'latitude' | 'longitude' | 'maxRadius'>,
  ): { ok: true } | { ok: false; error: string } {
    try {
      const centerLat = parseGeoCoordinate(retailer.latitude, 'latitude');
      const centerLng = parseGeoCoordinate(retailer.longitude, 'longitude');
      const radiusKm = parseMaxRadiusKm(retailer.maxRadius);
      if (
        !isWithinRadiusKm(checkLat, checkLng, centerLat, centerLng, radiusKm)
      ) {
        return {
          ok: false,
          error: 'You are outside the allowed check-in area for this retailer',
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Invalid retailer location configuration' };
    }
  }

  private buildCheckInRows(dto: BulkCheckInRetailerDto): CheckInSyncRow[] {
    return dto.checkIns.map((checkIn, index) => ({
      row: index + 1,
      checkIn,
    }));
  }

  private async findActiveTodayAttendance(
    tenantDb: DataSource,
    userId: string,
  ): Promise<Attendence | null> {
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return tenantDb
      .getRepository(Attendence)
      .createQueryBuilder('a')
      .where('a."userId" = :userId', { userId })
      .andWhere('a."attendenceDate" >= :today', { today })
      .andWhere('a."attendenceDate" < :tomorrow', { tomorrow })
      .andWhere('a."checkInTime" IS NOT NULL')
      .andWhere('a."checkOutTime" IS NULL')
      .orderBy('a."checkInTime"', 'DESC')
      .getOne();
  }

  private async saveAttendanceTrackingLogs(
    tenantDb: DataSource,
    userId: string,
    attendenceId: string,
    entries: CheckInTrackingEntry[],
  ): Promise<void> {
    if (!entries.length) {
      return;
    }

    const repo = tenantDb.getRepository(TrackingLog);
    await repo.save(
      entries.map((entry) =>
        repo.create({
          userId,
          attendenceId,
          latitude: entry.latitude,
          longitude: entry.longitude,
          logTime: entry.logTime,
        }),
      ),
    );
  }

  private async notifyCheckInCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Retailer check-in sync completed'
        : 'Retailer check-in sync failed';
    const message =
      status === 'completed'
        ? `Check-in sync finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : 'Retailer check-in sync failed. Please review sync logs.';

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        message,
        type: 'salesman_retailer_check_in_sync',
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

  private async processBulkCheckInJob(
    tenantDb: DataSource,
    jobId: string,
    rows: CheckInSyncRow[],
    user: { userId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    const retailerIds = [...new Set(rows.map((row) => row.checkIn.retailerId))];
    const retailers = await tenantDb.getRepository(Retailer).find({
      where: { id: In(retailerIds) },
      select: ['id', 'shopName', 'latitude', 'longitude', 'maxRadius'],
    });
    const retailerById = new Map(retailers.map((retailer) => [retailer.id, retailer]));

    const todayAttendedRetailerIds = await this.findTodayAttendancesForRetailers(
      tenantDb,
      retailerIds,
    );
    const batchRetailerIds = new Set<string>();
    const today = this.startOfDay(new Date());
    const attendanceRepo = tenantDb.getRepository(RetailerAttendence);
    const validRows: Array<{
      row: CheckInSyncRow;
      entity: Partial<RetailerAttendence>;
      label: string;
    }> = [];

    for (const row of rows) {
      const retailer = retailerById.get(row.checkIn.retailerId);
      const label = retailer?.shopName?.trim() || row.checkIn.retailerId;

      if (!retailer) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: label,
          status: 'error',
          error: 'Retailer not found',
        });
        continue;
      }

      if (
        todayAttendedRetailerIds.has(row.checkIn.retailerId) ||
        batchRetailerIds.has(row.checkIn.retailerId)
      ) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: label,
          status: 'error',
          error: 'Retailer attendance is already marked for today',
        });
        continue;
      }

      const areaResult = this.isWithinRetailerArea(
        row.checkIn.checkInLatitude,
        row.checkIn.checkInLongitude,
        retailer,
      );
      if (areaResult.ok === false) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: label,
          status: 'error',
          error: areaResult.error,
        });
        continue;
      }

      batchRetailerIds.add(row.checkIn.retailerId);
      validRows.push({
        row,
        label,
        entity: {
          userId: user.userId,
          retailerId: row.checkIn.retailerId,
          attendenceDate: today,
          checkinLatitude: row.checkIn.checkInLatitude,
          checkinLongitude: row.checkIn.checkInLongitude,
        },
      });
    }

    const activeAttendance = await this.findActiveTodayAttendance(
      tenantDb,
      user.userId,
    );
    const trackingEntries: CheckInTrackingEntry[] = [];

    if (validRows.length) {
      const recordSuccessfulCheckIn = (
        source: (typeof validRows)[number],
        attendance: RetailerAttendence,
      ) => {
        this.tenantJobService.appendLog(jobId, {
          row: source.row.row,
          name: source.label,
          status: 'success',
          metadata: {
            retailerAttendenceId: attendance.id,
            retailerId: attendance.retailerId,
          },
        });

        if (activeAttendance) {
          trackingEntries.push({
            latitude: source.row.checkIn.checkInLatitude,
            longitude: source.row.checkIn.checkInLongitude,
            logTime: attendance.createdAt ?? new Date(),
          });
        }
      };

      try {
        const saved = await attendanceRepo.save(
          validRows.map((item) => attendanceRepo.create(item.entity)),
        );

        saved.forEach((attendance, index) => {
          recordSuccessfulCheckIn(validRows[index], attendance);
        });
      } catch {
        for (const item of validRows) {
          try {
            const attendance = await attendanceRepo.save(
              attendanceRepo.create(item.entity),
            );
            recordSuccessfulCheckIn(item, attendance);
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

      if (activeAttendance) {
        await this.saveAttendanceTrackingLogs(
          tenantDb,
          user.userId,
          activeAttendance.id,
          trackingEntries,
        );
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Salesman retailer check-in sync completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifyCheckInCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async bulkCheckInRetailers(
    tenantDb: DataSource,
    dto: BulkCheckInRetailerDto,
    user: { userId: string },
    tenantCode: string,
  ) {
    if (!dto.checkIns?.length) {
      throw new BadRequestException('At least one check-in is required');
    }

    if (dto.checkIns.length > SALESMAN_BULK_CHECK_IN_MAX) {
      throw new BadRequestException(
        `At most ${SALESMAN_BULK_CHECK_IN_MAX} check-ins are allowed per sync`,
      );
    }

    const rows = this.buildCheckInRows(dto);
    const fileName = `salesman-retailer-check-in-sync-${new Date().toISOString()}`;

    const job = this.tenantJobService.createJob({
      tenantCode,
      jobType: 'SALESMAN_RETAILER_CHECK_IN_SYNC',
      fileName,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_STARTED',
      description: `Salesman retailer check-in sync started (${rows.length} records)`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName,
        totalRows: rows.length,
      },
    });

    void this.processBulkCheckInJob(tenantDb, job.id, rows, user, tenantCode).catch(
      async (error) => {
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
          description: 'Salesman retailer check-in sync failed',
          metadata: {
            jobId: job.id,
            jobType: job.jobType,
            fileName,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        await this.notifyCheckInCompletion(
          tenantDb,
          failedJob,
          user,
          tenantCode,
          'failed',
        );
      },
    );

    return {
      message: 'Retailer check-in sync started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
