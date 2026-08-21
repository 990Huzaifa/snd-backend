import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { Retailer } from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import {
  RetailerRouteTransferJob,
  RetailerRouteTransferJobItem,
} from 'src/tenant-db/entities/retailer-route-transfer.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import { BulkTransferRetailerRouteDto } from '../../dto/retailer/bulk-transfer-retailer-route.dto';
import { ActivityLogService } from '../activity-log.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';

@Injectable()
export class RetailerRouteTransferService {
  private readonly logger = new Logger(RetailerRouteTransferService.name);

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  private resolveEffectiveDate(dto: BulkTransferRetailerRouteDto): Date {
    if (dto.immediate === true) {
      return new Date();
    }
    if (!dto.effectiveDate?.trim()) {
      throw new BadRequestException('effectiveDate is required when immediate is false');
    }
    const date = new Date(dto.effectiveDate);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid effectiveDate');
    }
    return date;
  }

  private isDue(effectiveDate: Date): boolean {
    return effectiveDate.getTime() <= Date.now();
  }

  async create(
    tenantDb: DataSource,
    dto: BulkTransferRetailerRouteDto,
    user: { userId: string },
    tenantCode: string,
  ) {
    const destinationRouteId = dto.destinationRouteId.trim();
    const reason = dto.reason.trim();
    const remarks = dto.remarks?.trim() || null;
    const retailerIds = [...new Set(dto.retailerIds.map((id) => id.trim()).filter(Boolean))];
    const effectiveDate = this.resolveEffectiveDate(dto);

    if (!retailerIds.length) {
      throw new BadRequestException('At least one retailer is required');
    }

    const destinationRoute = await tenantDb.getRepository(Route).findOne({
      where: { id: destinationRouteId },
      select: ['id', 'name'],
    });
    if (!destinationRoute) {
      throw new NotFoundException('Destination route not found');
    }

    const retailers = await tenantDb.getRepository(Retailer).find({
      where: { id: In(retailerIds) },
      select: ['id', 'shopName', 'routeId'],
    });
    if (retailers.length !== retailerIds.length) {
      throw new NotFoundException('One or more retailers not found');
    }

    const alreadyOnDestination = retailers.filter((r) => r.routeId === destinationRouteId);
    if (alreadyOnDestination.length === retailerIds.length) {
      throw new BadRequestException('All selected retailers are already on the destination route');
    }

    const tenantJob = this.tenantJobService.createJob({
      tenantCode,
      jobType: 'RETAILER_ROUTE_TRANSFER',
      fileName: `retailer-route-transfer-${effectiveDate.toISOString()}`,
      createdBy: user.userId,
      totalRows: retailers.length,
    });

    const savedJob = await tenantDb.transaction(async (manager) => {
      const jobRepo = manager.getRepository(RetailerRouteTransferJob);
      const itemRepo = manager.getRepository(RetailerRouteTransferJobItem);

      const job = await jobRepo.save(
        jobRepo.create({
          destinationRouteId,
          effectiveDate,
          reason,
          remarks,
          status: 'PENDING',
          errorMessage: '',
          createdById: user.userId,
          tenantJobId: tenantJob.id,
        }),
      );

      const items = retailers.map((retailer) =>
        itemRepo.create({
          jobId: job.id,
          retailerId: retailer.id,
          fromRouteId: retailer.routeId,
          status: 'PENDING',
          errorMessage: '',
        }),
      );
      await itemRepo.save(items);

      return job;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_ROUTE_TRANSFER_JOB_CREATED',
      description: `Retailer route transfer job created for ${retailers.length} retailers`,
      metadata: {
        jobId: savedJob.id,
        tenantJobId: tenantJob.id,
        destinationRouteId,
        effectiveDate: effectiveDate.toISOString(),
        reason,
        retailerCount: retailers.length,
        immediate: dto.immediate === true || this.isDue(effectiveDate),
      },
    });

    if (this.isDue(effectiveDate)) {
      void this.processJob(tenantDb, savedJob.id, user, tenantCode).catch(async (error) => {
        this.logger.error(
          `Immediate retailer route transfer failed for job ${savedJob.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    }

    return {
      message: this.isDue(effectiveDate)
        ? 'Retailer route transfer started'
        : 'Retailer route transfer scheduled',
      jobId: savedJob.id,
      tenantJobId: tenantJob.id,
      status: 'PENDING' as const,
      effectiveDate: effectiveDate.toISOString(),
      totalRows: retailers.length,
    };
  }

  async list(
    tenantDb: DataSource,
    pageInput: number,
    limitInput: number,
    status?: string,
  ) {
    const page = Math.max(1, Number(pageInput) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitInput) || 10));
    const qb = tenantDb
      .getRepository(RetailerRouteTransferJob)
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.destinationRoute', 'destinationRoute')
      .leftJoinAndSelect('job.createdBy', 'createdBy')
      .orderBy('job.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status?.trim()) {
      qb.andWhere('job.status = :status', { status: status.trim().toUpperCase() });
    }

    const [result, total] = await qb.getManyAndCount();
    return { result, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string) {
    const job = await tenantDb.getRepository(RetailerRouteTransferJob).findOne({
      where: { id },
      relations: [
        'destinationRoute',
        'createdBy',
        'items',
        'items.retailer',
        'items.fromRoute',
      ],
    });
    if (!job) {
      throw new NotFoundException('Retailer route transfer job not found');
    }
    return job;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueJobsCron() {
    const tenants = await this.tenantRepo.find({
      where: { isActive: true },
      select: { id: true, code: true, status: true },
    });

    for (const tenant of tenants) {
      try {
        const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
        await this.processDueJobs(tenantDb, tenant.code);
      } catch (error) {
        this.logger.error(
          `Retailer route transfer cron failed for tenant ${tenant.code}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async processDueJobs(tenantDb: DataSource, tenantCode: string) {
    const dueJobs = await tenantDb
      .getRepository(RetailerRouteTransferJob)
      .createQueryBuilder('job')
      .where('job.status = :status', { status: 'PENDING' })
      .andWhere('job.effectiveDate <= :now', { now: new Date() })
      .orderBy('job.effectiveDate', 'ASC')
      .take(50)
      .getMany();

    for (const job of dueJobs) {
      await this.processJob(tenantDb, job.id, { userId: job.createdById }, tenantCode);
    }
  }

  private async processJob(
    tenantDb: DataSource,
    jobId: string,
    user: { userId: string },
    tenantCode: string,
  ) {
    const jobRepo = tenantDb.getRepository(RetailerRouteTransferJob);
    const itemRepo = tenantDb.getRepository(RetailerRouteTransferJobItem);
    const retailerRepo = tenantDb.getRepository(Retailer);

    const job = await jobRepo.findOne({ where: { id: jobId } });
    if (!job || job.status !== 'PENDING') {
      return;
    }

    job.status = 'PROCESSING';
    await jobRepo.save(job);

    if (job.tenantJobId) {
      try {
        this.tenantJobService.startJob(job.tenantJobId);
      } catch {
        // TenantJob may have expired from memory; continue with DB job.
      }
    }

    const items = await itemRepo.find({ where: { jobId: job.id } });
    const destinationExists = await tenantDb.getRepository(Route).findOne({
      where: { id: job.destinationRouteId },
      select: ['id'],
    });

    if (!destinationExists) {
      job.status = 'FAILED';
      job.errorMessage = 'Destination route not found';
      await jobRepo.save(job);
      await this.failTenantJob(job, 'Destination route not found');
      await this.notifyCompletion(tenantDb, job, user, tenantCode, 'failed');
      return;
    }

    for (const item of items) {
      try {
        const retailer = await retailerRepo.findOne({
          where: { id: item.retailerId },
          select: ['id', 'shopName', 'routeId'],
        });
        if (!retailer) {
          item.status = 'FAILED';
          item.errorMessage = 'Retailer not found';
          await itemRepo.save(item);
          this.appendTenantLog(job, item, 'error', 'Retailer not found');
          continue;
        }

        if (retailer.routeId === job.destinationRouteId) {
          item.fromRouteId = retailer.routeId;
          item.status = 'SUCCESS';
          item.errorMessage = '';
          await itemRepo.save(item);
          this.appendTenantLog(job, item, 'success', undefined, {
            skipped: true,
            reason: 'Already on destination route',
          });
          continue;
        }

        item.fromRouteId = retailer.routeId;
        retailer.routeId = job.destinationRouteId;
        await retailerRepo.save(retailer);

        item.status = 'SUCCESS';
        item.errorMessage = '';
        await itemRepo.save(item);
        this.appendTenantLog(job, item, 'success', undefined, {
          fromRouteId: item.fromRouteId,
          toRouteId: job.destinationRouteId,
        });
      } catch (error) {
        item.status = 'FAILED';
        item.errorMessage =
          error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
        await itemRepo.save(item);
        this.appendTenantLog(job, item, 'error', item.errorMessage);
      }
    }

    const failedCount = items.filter((item) => item.status === 'FAILED').length;
    const successCount = items.filter((item) => item.status === 'SUCCESS').length;

    job.status = failedCount === items.length ? 'FAILED' : 'COMPLETED';
    job.errorMessage =
      failedCount === items.length
        ? 'All retailer transfers failed'
        : failedCount > 0
          ? `${failedCount} retailer(s) failed`
          : '';
    await jobRepo.save(job);

    if (job.tenantJobId) {
      try {
        if (job.status === 'FAILED') {
          this.tenantJobService.failJob(job.tenantJobId);
        } else {
          this.tenantJobService.completeJob(job.tenantJobId);
        }
      } catch {
        // ignore expired in-memory job
      }
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action:
        job.status === 'COMPLETED'
          ? 'RETAILER_ROUTE_TRANSFER_JOB_COMPLETED'
          : 'RETAILER_ROUTE_TRANSFER_JOB_FAILED',
      description: `Retailer route transfer ${job.status.toLowerCase()}`,
      metadata: {
        jobId: job.id,
        tenantJobId: job.tenantJobId,
        destinationRouteId: job.destinationRouteId,
        successCount,
        failedCount,
        total: items.length,
      },
    });

    await this.notifyCompletion(
      tenantDb,
      job,
      user,
      tenantCode,
      job.status === 'COMPLETED' ? 'completed' : 'failed',
    );
  }

  private appendTenantLog(
    job: RetailerRouteTransferJob,
    item: RetailerRouteTransferJobItem,
    status: 'success' | 'error',
    error?: string,
    metadata?: Record<string, unknown>,
  ) {
    if (!job.tenantJobId) {
      return;
    }
    try {
      this.tenantJobService.appendLog(job.tenantJobId, {
        row: 0,
        name: item.retailerId,
        status,
        error,
        metadata: {
          retailerId: item.retailerId,
          fromRouteId: item.fromRouteId,
          ...metadata,
        },
      });
    } catch {
      // ignore
    }
  }

  private async failTenantJob(job: RetailerRouteTransferJob, error: string) {
    if (!job.tenantJobId) {
      return;
    }
    try {
      this.tenantJobService.appendLog(job.tenantJobId, {
        row: 0,
        name: '',
        status: 'error',
        error,
      });
      this.tenantJobService.failJob(job.tenantJobId);
    } catch {
      // ignore
    }
  }

  private async notifyCompletion(
    tenantDb: DataSource,
    job: RetailerRouteTransferJob,
    user: { userId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    let memoryJob: TenantJob | null = null;
    if (job.tenantJobId) {
      try {
        memoryJob = this.tenantJobService.getJobById(
          job.tenantJobId,
          tenantCode,
          user.userId,
        );
      } catch {
        memoryJob = null;
      }
    }

    const title =
      status === 'completed'
        ? 'Retailer route transfer completed'
        : 'Retailer route transfer failed';
    const message =
      status === 'completed'
        ? `Transfer finished. Inserted: ${memoryJob?.inserted ?? 0}, Failed: ${memoryJob?.failed ?? 0}`
        : `Transfer failed. ${job.errorMessage || 'Please review job logs.'}`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        message,
        type: 'retailer_route_transfer',
      },
      tenantCode,
      {
        job: {
          id: job.id,
          tenantJobId: job.tenantJobId,
          status: job.status,
          destinationRouteId: job.destinationRouteId,
          effectiveDate: job.effectiveDate,
          reason: job.reason,
          inserted: memoryJob?.inserted,
          failed: memoryJob?.failed,
          totalRows: memoryJob?.totalRows,
        },
      },
    );
  }
}
