import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
import { UpdateTenantThemeDto } from './dto/update-tenant-theme.dto';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { ProvisioningAdminService } from './services/provisioning-admin.service';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { TenantDatabaseService } from 'src/tenant-db/services/tenant-database.service';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { PlatformUser } from 'src/master-db/entities/platform-user.entity';
import { PlatformRole } from 'src/master-db/entities/platform-role.entity';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { Plan } from 'src/master-db/entities/plan.entity';
import { Status, BillingCycle, BillingModel, PaymentMode, CollectionType, Subscription } from 'src/master-db/entities/subscription.entity';

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
    private readonly profilesRepo: Repository<TenantProfile>,
    @InjectRepository(TenantGeoPolicy)
    private readonly geoPolicyRepo: Repository<TenantGeoPolicy>,
    @InjectRepository(TenantTheme)
    private readonly themesRepo: Repository<TenantTheme>,
    @InjectRepository(TenantDbConfig)
    private readonly dbConfigRepo: Repository<TenantDbConfig>,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    @InjectRepository(PlatformRole)
    private readonly platformRoleRepo: Repository<PlatformRole>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,

    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,

    private readonly provisioningAdminService: ProvisioningAdminService,
    private readonly tenantDatabaseService: TenantDatabaseService,
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


  async createTenant(dto: CreateTenantDto,) {
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
        code: code,
        status: TenantStatus.REGISTERED,
        industryType: dto.industryType
      }),
    );

    // 4️⃣ Create tenant subscription
    const plan = await this.planRepo.findOne({ where: { id: dto.planId } });

    if(plan) {
      const expiry = plan.monthly_price > 0 ? new Date(new Date().setMonth(new Date().getMonth() + 1)) : new Date(new Date().setFullYear(new Date().getFullYear() + 1))
      const subscription = new Subscription();
      subscription.tenant = tenant;
      subscription.plan = plan;
      subscription.billingCycle = dto.billingCycle;
      subscription.billingModel = BillingModel.SELF_SERVE;
      subscription.paymentMode = PaymentMode.OFFLINE;
      subscription.collectionType = CollectionType.MANUAL;

      subscription.status = Status.ACTIVE;
      subscription.expiresAt = expiry;
      subscription.cancelledAt = null;

      await this.subscriptionRepo.save(subscription);
    }


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
      // 🔹 STEP 0: Setup Database & User
      // ===============================
      await this.provisioningAdminService.createAdminConnection();
      const dbName = `snd_t_${tenant.code}`;


      await this.provisioningAdminService.createDatabaseIfNotExists(dbName);
      // 🔹 Log: database created
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Provison Tenant DB created',
      });
      
      const dbUser = `snd_u_${tenant.code}`;
      const existingConfig = await this.dbConfigRepo.findOne({
        where: { tenant: { id: tenant.id } },
      });

      let dbPass: string;

      if (existingConfig) {
        dbPass = existingConfig.password;
      } else {
        dbPass = this.generateStrongPassword();
      }

      await this.provisioningAdminService.createUserIfNotExists(dbUser, dbPass);
      
      // 🔹 Log: database user created
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Provison Tenant DB User created',
      });

      await this.provisioningAdminService.grantPrivileges(dbName, dbUser);
      await this.provisioningAdminService.grantSchemaPrivileges(dbName, dbUser);

      // 🔹 Log: grant privileges
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant DB User Set Privileges',
      });

      await this.saveDbConfigIfNotExists(tenant, dbName, dbUser, dbPass);

      // 🔹 Log: database config created
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant DB Config created',
      });
      await this.provisioningAdminService.closeConnection();


      // migrations
      await this.tenantDatabaseService.runMigrations(
        String(process.env.PROVISION_DB_HOST),
        Number(process.env.PROVISION_DB_PORT),
        dbUser,
        dbPass,
        dbName,
      );

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant DB migrations executed',
      });

      


      // ===============================
      // 🔹 STEP 1: Create tenant settings
      // ===============================
      await this.createDefaultSettingsIfNotExists(tenant);
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
      await this.createDefaultProfileIfNotExists(tenant);

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant default profile created',
      });

      // ===============================
      // 🔹 STEP 3: Create tenant theme
      // ===============================
      await this.createDefaultThemeIfNotExists(tenant);

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant default theme created',
      });


      // ===============================
      // 🔹 STEP 1: Create tenant Geo Policy
      // ===============================
      await this.createDefaultGeoPolicyIfNotExists(tenant);
      // throw new Error('Simulated provisioning failure'); // test fail line

      // 🔹 Log: settings created
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant default geo policy created',
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


  // sub functions

  private async saveDbConfigIfNotExists(
    tenant: Tenant,
    dbName: string,
    dbUser: string,
    dbPass: string,
  ) {
    const existing = await this.dbConfigRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.dbConfigRepo.save(
        this.dbConfigRepo.create({
          tenant,
          host: process.env.PROVISION_DB_HOST,
          port: Number(process.env.PROVISION_DB_PORT),
          database: dbName,
          username: dbUser,
          password: dbPass,
        }),
      );

      return { created: true };
    }

    return { created: false };
  }

  private async createDefaultSettingsIfNotExists(tenant: Tenant) {
    const existing = await this.settingsRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.settingsRepo.save(
        this.settingsRepo.create({
          tenant,
        }),
      );

      return { created: true };
    }

    return { created: false };
  }

  private async createDefaultGeoPolicyIfNotExists(tenant: Tenant) {
    const existing = await this.geoPolicyRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.geoPolicyRepo.save(
        this.geoPolicyRepo.create({
          tenant,
        }),
      );

      return { created: true };
    }

    return { created: false };
  }

  private async createDefaultProfileIfNotExists(tenant: Tenant) {
    const existing = await this.profilesRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.profilesRepo.save(
        this.profilesRepo.create({
          tenant,
          displayName: tenant.name
        }),
      );

      return { created: true };
    }

    return { created: false };
  }

  private async createDefaultThemeIfNotExists(tenant: Tenant) {
    const existing = await this.themesRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.themesRepo.save(
        this.themesRepo.create({
          tenant
        }),
      );

      return { created: true };
    }

    return { created: false };
  }



  // tenant profile service

  async getTenantProfile(tenantId: string) {
    const profile = await this.profilesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    return profile;
  }

  async updateTenantProfile(tenantId: string, dto: UpdateTenantProfileDto) {
    const profile = await this.profilesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    Object.assign(profile, dto);

    await this.profilesRepo.save(profile);

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

  // tenant theme service

  async getTenantThemes(tenantId: string) {
    const theme = await this.themesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!theme) {
      throw new NotFoundException('Tenant theme not found');
    }

    return theme;
  }


  async updateTenantThemes(tenantId: string, dto: UpdateTenantThemeDto) {
    const theme = await this.themesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!theme) {
      throw new NotFoundException('Tenant theme not found');
    }

    Object.assign(theme, dto);

    await this.themesRepo.save(theme);

    return {
      message: 'Tenant theme updated successfully',
      theme,
    };
  }
  async updateTenantLogo(
    tenantId: string,
    logo: Express.Multer.File,
  ) {
    if (!logo) {
      throw new BadRequestException('Logo file is required');
    }

    const profile = await this.profilesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    // 🔹 TEMP logic (future: S3 / Cloudinary)
    // make file name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `${uniqueSuffix}-${logo.originalname}`;

    profile.logoUrl = `/uploads/logos/${filename}`;

    await this.profilesRepo.save(profile);

    return {
      message: 'Tenant logo updated successfully',
      logoUrl: profile.logoUrl,
    };
  }

  private generateStrongPassword(length = 16): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    
    return result;
  }


  // user, role CRUD


}
