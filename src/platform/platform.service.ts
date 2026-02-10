import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant, TenantStatus } from '../master-db/entities/tenant.entity';
import { Repository } from 'typeorm';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantProvisioningJob } from 'src/master-db/entities/tenant-provisioning-job.entity';
import { TenantProvisioningLog } from 'src/master-db/entities/tenant-provisioning-log.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantProfile } from 'src/master-db/entities/tenant-profile.entity';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantProvisioningJob)
    private readonly jobRepo: Repository<TenantProvisioningJob>,
    @InjectRepository(TenantProvisioningLog)
    private readonly logRepo: Repository<TenantProvisioningLog>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    @InjectRepository(TenantProfile)
    private readonly profileRepo: Repository<TenantProfile>,
  ) { }

  private async generateUniqueCode(): Promise<string> {
    while (true) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      const exists = await this.tenantRepo.findOne({
        where: { code },
      });

      if (!exists) {
        return code;
      }
    }
  }
  async resolveTenant(code: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { code, isActive: true },
      select: ['id', 'name', 'code'],
    });
    if (!tenant) {
      return null
    }
    return tenant
  }

  async getProvisioningList() {
    // 1️⃣ Fetch tenants
    const tenants = await this.tenantRepo.find({
      select: ['id', 'name', 'status', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });

    // 2️⃣ For each tenant, get latest job
    const results = await Promise.all(
      tenants.map(async (tenant) => {
        const lastJob = await this.jobRepo.findOne({
          where: { tenant: { id: tenant.id } },
          order: { startedAt: 'DESC' },
        });

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantStatus: tenant.status,
          lastJobId: lastJob?.id ?? null,
          lastJobStatus: lastJob?.status ?? null,
          lastError: lastJob?.errorMessage ?? null,
          lastUpdatedAt: lastJob?.finishedAt ?? tenant.updatedAt,
        };
      }),
    );

    return results;
  }

  async getProvisioningDetails(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // 1️⃣ Fetch all jobs for tenant
    const jobs = await this.jobRepo.find({
      where: { tenant: { id: tenant.id } },
      order: { startedAt: 'DESC' },
    });

    // 2️⃣ Attach logs to each job
    const jobsWithLogs = await Promise.all(
      jobs.map(async (job) => {
        const logs = await this.logRepo.find({
          where: { job: { id: job.id } },
          order: { createdAt: 'ASC' },
        });

        return {
          jobId: job.id,
          status: job.status,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          errorMessage: job.errorMessage,
          logs: logs.map((log) => ({
            level: log.level,
            message: log.message,
            createdAt: log.createdAt,
          })),
        };
      }),
    );

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
      },
      jobs: jobsWithLogs,
    };
  }


  async createTenant(dto: CreateTenantDto) {
    // 1️⃣ Subdomain uniqueness check
    const nameExists = await this.tenantRepo.findOne({
      where: { name: dto.name },
    });

    if (nameExists) {
      throw new ConflictException('Tenant name already exists');
    }

    // 2️⃣ Generate unique code
    const code = await this.generateUniqueCode();

    // 3️⃣ Create tenant identity
    const tenant = await this.tenantRepo.save(
      this.tenantRepo.create({
        name: dto.name,
        email: dto.email,
        code: await this.generateUniqueCode(),
        status: TenantStatus.REGISTERED,
        industryType: dto.industryType
      }),
    );

    // 🔥 AUTO provisioning trigger
    await this.startProvisioningSkeleton(tenant.id);

    return tenant;
  }

  async startProvisioning(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });
    if(!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== TenantStatus.REGISTERED) {
      throw new ConflictException(
        `Cannot provision tenant in status ${tenant.status}`,
      );
    }

    tenant.status = TenantStatus.PROVISIONING;
    await this.tenantRepo.save(tenant);

    return {
      message: 'Provisioning started',
      status: tenant.status,
    };
  }

  async retryProvisioning(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const runningJob = await this.jobRepo.findOne({
      where: {
        tenant: { id: tenant.id },
        status: 'RUNNING',
      },
    });

    if (runningJob) {
      throw new ConflictException('Provisioning already in progress');
    }

    if (tenant.status !== TenantStatus.FAILED) {
      throw new ConflictException(
        `Retry not allowed in status ${tenant.status}`,
      );
    }

    // 🔁 Start provisioning again
    await this.startProvisioningSkeleton(tenant.id);

    return {
      message: 'Provisioning retry started',
    };
  }

  async startProvisioningSkeleton(tenantId: string) {

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) return;

    // Move tenant to PROVISIONING
    tenant.status = TenantStatus.PROVISIONING;
    await this.tenantRepo.save(tenant);

    // Create job
    const job = await this.jobRepo.save(
      this.jobRepo.create({
        tenant,
        status: 'RUNNING',
      }),
    );

    // Log
    await this.logRepo.save({
      job,
      level: 'INFO',
      message: 'Provisioning started (skeleton)',
    });

    try{     
      // ===============================
      // 🔹 STEP 1: Create tenant settings
      // ===============================
      await this.settingsRepo.save(
        this.settingsRepo.create({
          tenant,
          // defaults auto-apply:
          // timezone: UTC
          // currency: USD
          // baseUom: PCS
          // baseLocale: EN
        }),
      );
      // throw new Error('Simulated provisioning failure'); // test fail line

      // 🔹 Log: settings created
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant default settings created',
      });

      // ===============================
      // 🔹 STEP 2: Create tenant profile
      // ===============================
      await this.profileRepo.save(
        this.profileRepo.create({
          tenant,
          displayName: tenant.name, // default
        }),
      );

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant profile created',
      });

      // 🚧 STOP HERE — (future steps plug below) 

      // 🔥 FINALIZE provisioning (CURRENT SCOPE)
      await this.markProvisioningSuccess(tenant, job);
    } catch (e) {
      await this.markProvisioningFailed(tenant, job, e);
    }
  }

  private async markProvisioningSuccess(
    tenant: Tenant,
    job: TenantProvisioningJob,
  ) {
    // Tenant status update
    tenant.status = TenantStatus.PROVISIONED;
    await this.tenantRepo.save(tenant);

    // Job status update
    job.status = 'SUCCESS';
    job.finishedAt = new Date();
    await this.jobRepo.save(job);

    // Log
    await this.logRepo.save({
      job,
      level: 'INFO',
      message: 'Provisioning completed successfully',
    });
  }

  private async markProvisioningFailed(
    tenant,
    job,
    error,
  ) {
    const message = error instanceof Error ? error.message : 'Unknown provisioning error';
    // 1️⃣ Update tenant status
    tenant.status = TenantStatus.FAILED;
    await this.tenantRepo.save(tenant);

    // 2️⃣ Update job status
    job.status = 'FAILED';
    job.finishedAt = new Date();
    job.errorMessage = message;
    await this.jobRepo.save(job);

    // 3️⃣ Log error
    await this.logRepo.save({
      job,
      level: 'ERROR',
      message: `Provisioning failed: ${message}`,
    });
  }
  
  async suspendTenant(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new ConflictException('Tenant already suspended');
    }

    tenant.status = TenantStatus.SUSPENDED;
    await this.tenantRepo.save(tenant);

    return {
      message: 'Tenant suspended successfully',
      tenantId: tenant.id,
      status: tenant.status,
    };
  }

  async resumeTenant(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== TenantStatus.SUSPENDED) {
      throw new ConflictException(
        `Cannot resume tenant from status ${tenant.status}`,
      );
    }

    tenant.status = TenantStatus.PROVISIONED;
    await this.tenantRepo.save(tenant);

    return {
      message: 'Tenant resumed successfully',
      tenantId: tenant.id,
      status: tenant.status,
    };
  }


  // tenant profile service

  async getTenantProfile(tenantId: string) {
    const profile = await this.profileRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    return profile;
  }

  async updateTenantProfile(tenantId: string, dto: UpdateTenantProfileDto) {
    const profile = await this.profileRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    Object.assign(profile, dto);

    await this.profileRepo.save(profile);

    return {
      message: 'Tenant profile updated successfully',
      profile,
    };
  }

  // tenant settings service

  async getTenantSettings(tenantId: string) {
    const settings = await this.settingsRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!settings) {
      throw new NotFoundException('Tenant settings not found');
    }

    return settings;
  }

  async updateTenantSettings(tenantId: string, dto: UpdateTenantSettingsDto) {
    const settings = await this.settingsRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!settings) {
      throw new NotFoundException('Tenant settings not found');
    }

    Object.assign(settings, dto);

    await this.settingsRepo.save(settings);

    return {
      message: 'Tenant settings updated successfully',
      settings,
    };
  }


}
