import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import {
  Product,
  ProductPricing,
  ProductPricingJob,
} from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateProductPricingJobDto } from '../dto/product-pricing-job/create-product-pricing-job.dto';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';

@Injectable()
export class ProductPricingJobService {
  private readonly logger = new Logger(ProductPricingJobService.name);

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async create(
    tenantDb: DataSource,
    dto: CreateProductPricingJobDto,
    user: { userId: string },
  ) {
    const product = await tenantDb.getRepository(Product).findOne({
      where: { id: dto.productId, isDelete: false },
      select: ['id', 'name'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const productPricing = await tenantDb.getRepository(ProductPricing).findOne({
      where: { id: dto.productPricingId, productId: dto.productId },
      select: ['id', 'productId', 'tradePrice', 'retailPrice'],
    });
    if (!productPricing) {
      throw new NotFoundException('Product pricing not found for selected product');
    }

    const jobRepo = tenantDb.getRepository(ProductPricingJob);
    const created = await jobRepo.save(
      jobRepo.create({
        productId: dto.productId,
        productPricingId: dto.productPricingId,
        startDate: new Date(dto.startDate),
        status: 'PENDING',
        tradePrice: dto.tradePrice.trim(),
        retailPrice: dto.retailPrice.trim(),
        quantity: Number(dto.quantity),
        errorMessage: '',
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_PRICING_JOB_CREATED',
      description: 'Product pricing job created',
      metadata: { productPricingJobId: created.id, productId: product.id, productPricingId: productPricing.id },
    });

    return this.view(tenantDb, created.id);
  }

  async list(
    tenantDb: DataSource,
    pageInput: number,
    limitInput: number,
    search: string,
    status?: string,
  ) {
    const page = Math.max(1, Number(pageInput) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitInput) || 10));
    const query = tenantDb
      .getRepository(ProductPricingJob)
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.product', 'product')
      .leftJoinAndSelect('job.productPricing', 'productPricing')
      .where('1=1');

    const normalizedSearch = (search ?? '').trim();
    if (normalizedSearch) {
      query.andWhere(
        new Brackets((sub) => {
          sub
            .where('product.name ILIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('product.skuCode ILIKE :search', { search: `%${normalizedSearch}%` });
        }),
      );
    }

    if (status?.trim()) {
      query.andWhere('job.status = :status', { status: status.trim().toUpperCase() });
    }

    const [result, total] = await query
      .orderBy('job.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { result, meta: { total, page, limit } };
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
        await this.processDueJobs(tenantDb);
      } catch (error) {
        this.logger.error(
          `Product pricing job cron failed for tenant ${tenant.code}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async processDueJobs(tenantDb: DataSource) {
    const jobRepo = tenantDb.getRepository(ProductPricingJob);
    const dueJobs = await jobRepo
      .createQueryBuilder('job')
      .where('job.status = :status', { status: 'PENDING' })
      .andWhere('job.startDate <= :now', { now: new Date() })
      .orderBy('job.startDate', 'ASC')
      .take(100)
      .getMany();

    for (const job of dueJobs) {
      try {
        await tenantDb.transaction(async (manager) => {
          const txJobRepo = manager.getRepository(ProductPricingJob);
          const txPricingRepo = manager.getRepository(ProductPricing);

          const freshJob = await txJobRepo.findOne({ where: { id: job.id } });
          if (!freshJob || freshJob.status !== 'PENDING') {
            return;
          }

          const pricing = await txPricingRepo.findOne({
            where: { id: freshJob.productPricingId, productId: freshJob.productId },
          });
          if (!pricing) {
            freshJob.status = 'FAILED';
            freshJob.errorMessage = 'Target product pricing not found';
            await txJobRepo.save(freshJob);
            return;
          }

          pricing.tradePrice = freshJob.tradePrice;
          pricing.retailPrice = freshJob.retailPrice;
          await txPricingRepo.save(pricing);

          freshJob.status = 'COMPLETED';
          freshJob.errorMessage = '';
          await txJobRepo.save(freshJob);
        });
      } catch (error) {
        const failedJob = await jobRepo.findOne({ where: { id: job.id } });
        if (failedJob && failedJob.status === 'PENDING') {
          failedJob.status = 'FAILED';
          failedJob.errorMessage =
            error instanceof Error ? error.message.slice(0, 500) : 'Unexpected cron failure';
          await jobRepo.save(failedJob);
        }
      }
    }
  }

  private async view(tenantDb: DataSource, id: string) {
    const job = await tenantDb.getRepository(ProductPricingJob).findOne({
      where: { id },
      relations: ['product', 'productPricing'],
    });
    if (!job) {
      throw new NotFoundException('Product pricing job not found');
    }
    return job;
  }
}
