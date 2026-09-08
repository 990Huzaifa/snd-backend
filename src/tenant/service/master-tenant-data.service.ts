import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LIMIT_KEY } from 'src/master-db/entities/plan.entity';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { Status, Subscription } from 'src/master-db/entities/subscription.entity';
import { Repository } from 'typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { TenantModule } from 'src/master-db/entities/tenant-modules.entity';

export type TenantPlanLimit = {
  limitKey: LIMIT_KEY;
  limitValue: number;
};

@Injectable()
export class MasterTenantDataService {
  private readonly logger = new Logger(MasterTenantDataService.name);

  constructor(
    @InjectRepository(TenantSettings)
    private readonly tenantSettingsRepo: Repository<TenantSettings>,
    @InjectRepository(TenantGeoPolicy)
    private readonly tenantGeoPolicyRepo: Repository<TenantGeoPolicy>,
    @InjectRepository(TenantTheme)
    private readonly tenantThemeRepo: Repository<TenantTheme>,
    @InjectRepository(TenantModule)
    private readonly tenantModuleRepo: Repository<TenantModule>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  async getTenantSettingsByTenantId(tenantId?: string | null): Promise<TenantSettings | null> {
    if (!tenantId?.trim()) {
      return null;
    }

    return this.tenantSettingsRepo.findOne({
      where: { tenant: { id: tenantId.trim() } },
    });
  }

  async getTenantGeoPolicyByTenantId(tenantId?: string | null): Promise<TenantGeoPolicy | null> {
    if (!tenantId?.trim()) {
      return null;
    }

    return this.tenantGeoPolicyRepo.findOne({
      where: { tenant: { id: tenantId.trim() } },
    });
  }

  async getTenantThemeByTenantId(tenantId?: string | null): Promise<TenantTheme | null> {
    if (!tenantId?.trim()) {
      return null;
    }

    return this.tenantThemeRepo.findOne({
      where: { tenant: { id: tenantId.trim() } },
    });
  }

  async getTenantCodeByTenantId(tenantId?: string | null): Promise<string | null> {
    if (!tenantId?.trim()) {
      return null;
    }
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId.trim() },
      select: ['id', 'code'],
    });
    if (!tenant) {
      return null;
    }
    return tenant.code;
  }

  async getTenantSubdomainByTenantId(tenantId?: string | null): Promise<string | null> {
    if (!tenantId?.trim()) {
      return null;
    }
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId.trim() },
      select: ['id', 'name'],
    });
    if (!tenant) {
      return null;
    }
    return tenant.name;
  }

  async getTenantModulesByTenantId(tenantId?: string | null) {
    if (!tenantId?.trim()) {
      return [];
    }
    return this.tenantModuleRepo.find({
      where: { tenant: { id: tenantId.trim() } },
      relations: { module: true },
    });
  }

  async getTenantLimitsByTenantId(tenantId?: string | null): Promise<TenantPlanLimit[]> {
    if (!tenantId?.trim()) {
      return [];
    }

    // Raw join avoids fragile nested relation hydration (plan → plan_limits)
    // and matches actual DB column names (subscriptions."planId", plan_limits.plan_id).
    const rows: Array<{ limitKey: string; limitValue: string | number }> =
      await this.subscriptionRepo.manager.query(
        `
          SELECT pl."limitKey" AS "limitKey", pl."limitValue" AS "limitValue"
          FROM subscriptions s
          INNER JOIN plans p ON p.id = s."planId"
          INNER JOIN plan_limits pl ON pl.plan_id = p.id
          WHERE s.tenant_id = $1
            AND s.status = $2
        `,
        [tenantId.trim(), Status.ACTIVE],
      );

    if (!rows?.length) {
      return [];
    }

    return rows.map((row) => ({
      limitKey: row.limitKey as LIMIT_KEY,
      limitValue: Number(row.limitValue),
    }));
  }

  async getBackupRetentionLimit(tenantId?: string | null): Promise<number> {
    const limits = await this.getTenantLimitsByTenantId(tenantId);
    const backupLimit = limits.find((l) => l.limitKey === LIMIT_KEY.DAILY_BACKUP);
    if (!backupLimit || backupLimit.limitValue <= 0) {
      return 0;
    }
    return backupLimit.limitValue;
  }

  async tenantHasBackupFeature(tenantId?: string | null): Promise<boolean> {
    return (await this.getBackupRetentionLimit(tenantId)) > 0;
  }

  async getTenantMasterDataByTenantId(tenantId?: string | null) {
    if (!tenantId?.trim()) {
      return {
        modules: [],
        tenantCode: null,
        settings: null,
        geoPolicy: null,
        theme: null,
        limits: [],
      };
    }

    const normalizedTenantId = tenantId.trim();

    const settled = await Promise.allSettled([
      this.getTenantCodeByTenantId(normalizedTenantId),
      this.getTenantSettingsByTenantId(normalizedTenantId),
      this.getTenantGeoPolicyByTenantId(normalizedTenantId),
      this.getTenantThemeByTenantId(normalizedTenantId),
      this.getTenantModulesByTenantId(normalizedTenantId),
      this.getTenantLimitsByTenantId(normalizedTenantId),
    ]);

    const labels = [
      'tenantCode',
      'settings',
      'geoPolicy',
      'theme',
      'modules',
      'limits',
    ] as const;

    settled.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `master-data failed loading ${labels[index]} for tenant ${normalizedTenantId}`,
          result.reason instanceof Error ? result.reason.stack : result.reason,
        );
      }
    });

    const value = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === 'fulfilled' ? result.value : fallback;

    return {
      tenantCode: value(settled[0], null),
      settings: value(settled[1], null),
      geoPolicy: value(settled[2], null),
      theme: value(settled[3], null),
      modules: value(settled[4], []),
      limits: value(settled[5], []),
    };
  }
}
