import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { Flavour, Product, ProductFlavour } from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateFlavourDto } from '../dto/flavour/create-flavour.dto';
import { UpdateFlavourDto } from '../dto/flavour/update-flavour.dto';
import * as XLSX from 'xlsx';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';

@Injectable()
export class FlavourService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private sanitizeFlavourName(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  private parseFlavourNamesFromFile(file: Express.Multer.File): Array<{ row: number; name: string }> {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) {
      throw new BadRequestException('Only CSV, XLS, and XLSX files are supported');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });

    const flavourNames: Array<{ row: number; name: string }> = [];
    rows.forEach((row, index) => {
      if (!row?.length) {
        return;
      }
      const firstColumnValue = row[0];
      const normalizedName = this.sanitizeFlavourName(String(firstColumnValue ?? ''));
      if (!normalizedName || normalizedName.toLowerCase() === 'name') {
        return;
      }
      flavourNames.push({ row: index + 1, name: normalizedName });
    });

    return flavourNames;
  }

  private async notifyImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title = status === 'completed' ? 'Flavour import completed' : 'Flavour import failed';
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        message,
        type: 'flavour_import',
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

  private async processImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: Array<{ row: number; name: string }>,
    user: any,
    tenantCode: string,
  ) {
    const job = this.tenantJobService.startJob(jobId);
    const flavourRepo = tenantDb.getRepository(Flavour);

    for (const row of rows) {
      try {
        const exists = await flavourRepo.findOne({ where: { name: row.name } });
        if (exists) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const created = await flavourRepo.save(flavourRepo.create({ name: row.name }));
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'success',
          metadata: { flavourId: created.id },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Flavour import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifyImportCompletion(tenantDb, completedJob, user, tenantCode, 'completed');
  }

  async create(tenantDb: DataSource, dto: CreateFlavourDto, user: any) {
    const name = dto.name.trim();
    const flavourRepo = tenantDb.getRepository(Flavour);
    const existingFlavour = await flavourRepo.findOne({ where: { name } });

    if (existingFlavour) {
      throw new ConflictException('Flavour with this name already exists');
    }

    const createdFlavour = await flavourRepo.save(flavourRepo.create({ name }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_CREATED',
      description: `Flavour ${createdFlavour.name} created`,
      metadata: { flavourId: createdFlavour.id },
    });

    return createdFlavour;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [flavours, total] = await tenantDb.getRepository(Flavour).findAndCount({
      where: { name: Like(`%${search}%`) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_LISTED',
      description: 'Flavours listed',
      metadata: { total, page, limit },
    });

    return { result: flavours, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const flavour = await tenantDb.getRepository(Flavour).findOne({
      where: { id },
    });

    if (!flavour) {
      throw new NotFoundException('Flavour not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_VIEWED',
      description: `Flavour ${flavour.name} viewed`,
      metadata: { flavourId: flavour.id },
    });

    return flavour;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateFlavourDto, user: any) {
    const flavourRepo = tenantDb.getRepository(Flavour);
    const flavour = await flavourRepo.findOne({ where: { id } });

    if (!flavour) {
      throw new NotFoundException('Flavour not found');
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (nextName !== flavour.name) {
        const nameTaken = await flavourRepo.findOne({ where: { name: nextName } });
        if (nameTaken) {
          throw new ConflictException('Flavour with this name already exists');
        }
        flavour.name = nextName;
      }
    }

    await flavourRepo.save(flavour);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_UPDATED',
      description: `Flavour ${flavour.name} updated`,
      metadata: { flavourId: flavour.id },
    });

    return flavour;
  }

  async delete(tenantDb: DataSource, id: string, user: any) {
    const flavourRepo = tenantDb.getRepository(Flavour);
    const productFlavourRepo = tenantDb.getRepository(ProductFlavour);

    const flavour = await flavourRepo.findOne({ where: { id } });
    if (!flavour) {
      throw new NotFoundException('Flavour not found');
    }

    const flavourInUseCount = await productFlavourRepo
      .createQueryBuilder('productFlavour')
      .leftJoin(Product, 'product', 'product.id = productFlavour.productId')
      .where('productFlavour.flavourId = :flavourId', { flavourId: flavour.id })
      .andWhere('(product.id IS NULL OR product.isDelete = false)')
      .getCount();

    if (flavourInUseCount > 0) {
      throw new ConflictException('Flavour is in use by products and cannot be deleted');
    }

    await flavourRepo.remove(flavour);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_DELETED',
      description: `Flavour ${flavour.name} deleted`,
      metadata: { flavourId: flavour.id },
    });

    return { message: 'Flavour deleted successfully' };
  }

  async importFlavours(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: any,
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseFlavourNamesFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No flavour names found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      jobType: 'FLAVOUR_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_STARTED',
      description: `Flavour import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processImportJob(tenantDb, job.id, rows, user, tenantCode).catch(async (error) => {
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
        description: `Flavour import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await this.notifyImportCompletion(tenantDb, failedJob, user, tenantCode, 'failed');
    });

    return {
      message: 'Flavour import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
