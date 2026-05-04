import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { Repository } from 'typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';

@Injectable()
export class MasterTenantDataService {
  constructor(
    @InjectRepository(TenantSettings)
    private readonly tenantSettingsRepo: Repository<TenantSettings>,
    @InjectRepository(TenantGeoPolicy)
    private readonly tenantGeoPolicyRepo: Repository<TenantGeoPolicy>,
    @InjectRepository(TenantTheme)
    private readonly tenantThemeRepo: Repository<TenantTheme>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
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
      select: ['code'],
    });
    return tenant?.code ?? null;

  }

  async getTenantMasterDataByTenantId(tenantId?: string | null) {
    if (!tenantId?.trim()) {
      return {
        tenantCode: null,
        settings: null,
        geoPolicy: null,
        theme: null,
      };
    }

    const normalizedTenantId = tenantId.trim();

    const [tenantCode, settings, geoPolicy, theme] = await Promise.all([
      this.getTenantCodeByTenantId(normalizedTenantId),
      this.getTenantSettingsByTenantId(normalizedTenantId),
      this.getTenantGeoPolicyByTenantId(normalizedTenantId),
      this.getTenantThemeByTenantId(normalizedTenantId),
    ]);

    return {
      tenantCode,
      settings,
      geoPolicy,
      theme,
    };
  }
}
