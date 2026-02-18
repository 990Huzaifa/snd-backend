import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { Tenant } from '../master-db/entities/tenant.entity';
import { TenantProvisioningJob } from 'src/master-db/entities/tenant-provisioning-job.entity';
import { TenantProvisioningLog } from 'src/master-db/entities/tenant-provisioning-log.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantProfile } from 'src/master-db/entities/tenant-profile.entity';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { ProvisioningAdminService } from './services/provisioning-admin.service';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { TenantDatabaseService } from 'src/tenant-db/services/tenant-database.service';
import { PlatformRole } from 'src/master-db/entities/platform-role.entity';
import { PlatformUser } from 'src/master-db/entities/platform-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      TenantProvisioningJob,
      TenantProvisioningLog,
      TenantSettings,
      TenantProfile,
      TenantTheme,
      TenantDbConfig,
      PlatformRole,
      PlatformUser,
    ]),
  ],
  controllers: [PlatformController],
  providers: [PlatformService, ProvisioningAdminService, TenantDatabaseService],
})
export class PlatformModule {}
