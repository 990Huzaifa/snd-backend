import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import * as XLSX from 'xlsx';
import { Retailer, RetailerChannel } from 'src/tenant-db/entities/retailer.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateRetailerChannelDto } from '../dto/retailer-channel/create-retailer-channel.dto';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';

@Injectable()
export class RetailerChannelService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private normalize(value: string): string {
    return value.trim();
  }

  private sanitizeName(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  private parseNamesFromFile(file: Express.Multer.File): Array<{ row: number; name: string }> {
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

    const names: Array<{ row: number; name: string }> = [];
    rows.forEach((row, index) => {
      if (!row?.length) {
        return;
      }
      const firstColumnValue = row[0];
      const normalizedName = this.sanitizeName(String(firstColumnValue ?? ''));
      if (!normalizedName || normalizedName.toLowerCase() === 'name') {
        return;
      }
      names.push({ row: index + 1, name: normalizedName });
    });

    return names;
  }

  private async notifyImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Retailer channel import completed'
        : 'Retailer channel import failed';
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
        type: 'retailer_channel_import',
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
    this.tenantJobService.startJob(jobId);

    const channelRepo = tenantDb.getRepository(RetailerChannel);
    for (const row of rows) {
      try {
        const exists = await channelRepo.findOne({ where: { name: row.name } });
        if (exists) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const created = await channelRepo.save(channelRepo.create({ name: row.name }));
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'success',
          metadata: { retailerChannelId: created.id },
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
      description: `Retailer channel import completed for ${completedJob.fileName}`,
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

  async importChannels(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: any,
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseNamesFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No retailer channel names found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      jobType: 'RETAILER_CHANNEL_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_STARTED',
      description: `Retailer channel import started for ${file.originalname}`,
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
        description: `Retailer channel import failed for ${file.originalname}`,
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
      message: 'Retailer channel import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }

  async create(tenantDb: DataSource, dto: CreateRetailerChannelDto, user: any) {
    const name = this.normalize(dto.name);

    const existing = await tenantDb.getRepository(RetailerChannel).findOne({
      where: { name },
    });
    if (existing) {
      throw new ConflictException('Retailer channel with this name already exists');
    }

    const channel = tenantDb.getRepository(RetailerChannel).create({ name });
    const created = await tenantDb.getRepository(RetailerChannel).save(channel);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHANNEL_CREATED',
      description: `Retailer channel ${created.name} created`,
      metadata: { retailerChannelId: created.id },
    });

    return created;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [channels, total] = await tenantDb.getRepository(RetailerChannel).findAndCount({
      where: { name: Like(`%${search}%`) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHANNEL_LISTED',
      description: 'Retailer channels listed',
      metadata: { total, page, limit },
    });

    return { result: channels, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const channel = await tenantDb.getRepository(RetailerChannel).findOne({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Retailer channel not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHANNEL_VIEWED',
      description: `Retailer channel ${channel.name} viewed`,
      metadata: { retailerChannelId: channel.id },
    });

    return channel;
  }

  async delete(tenantDb: DataSource, id: string, user: any) {
    const channelRepo = tenantDb.getRepository(RetailerChannel);
    const retailerRepo = tenantDb.getRepository(Retailer);

    const channel = await channelRepo.findOne({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Retailer channel not found');
    }

    const inUseCount = await retailerRepo.count({
      where: { retailerChannelId: channel.id },
    });

    if (inUseCount > 0) {
      throw new ConflictException('Retailer channel is in use by retailers and cannot be deleted');
    }

    await channelRepo.remove(channel);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHANNEL_DELETED',
      description: `Retailer channel ${channel.name} deleted`,
      metadata: { retailerChannelId: channel.id },
    });

    return { message: 'Retailer channel deleted successfully' };
  }
}
