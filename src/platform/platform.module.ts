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
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { Customer } from 'src/master-db/entities/customer.entity';
import { CustomerService } from './services/customer.service';
import { CustomerController } from './controller/customer.controller';
import { MailService } from 'src/common/mail/mail.service';
import { HttpModule } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { UtilityController } from './controller/utility.controller';
import { UtilityService } from './services/utility.service';
import { Country } from 'src/master-db/entities/country.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      Tenant,
      TenantProvisioningJob,
      TenantProvisioningLog,
      TenantSettings,
      TenantProfile,
      TenantGeoPolicy,
      TenantTheme,
      TenantDbConfig,
      PlatformRole,
      PlatformUser,
      Customer,
      Country
    ]),
  ],
  controllers: [PlatformController, CustomerController, UtilityController],
  providers: [PlatformService, ProvisioningAdminService, TenantDatabaseService, CustomerService, UtilityService, MailService, JwtService],
})
export class PlatformModule {}
