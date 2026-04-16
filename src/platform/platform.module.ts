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
import { State } from 'src/master-db/entities/state.entity';
import { City } from 'src/master-db/entities/city.entity';
import { PlanController } from './controller/plan.controller';
import { AnnouncementController } from './controller/announcement.controller';
import { PlanService } from './services/plan.service';
import { Announcement, AnnouncementPlan, AnnouncementTenant } from 'src/master-db/entities/announcement.entity';
import { AnnouncementService } from './services/announcements.service';
import { Plan, PlanLimit } from 'src/master-db/entities/plan.entity';
import { PlatformUserService } from './services/platform-user.service';
import { PlatformUserController } from './controller/platform-user.controller';
import { PlatformPermission } from 'src/master-db/entities/platform-premission.entity';
import { Subscription } from 'src/master-db/entities/subscription.entity';
import { SubscriptionController } from './controller/subscription.controller';
import { SubscriptionService } from './services/subscription.service';

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
      PlatformPermission,
      PlatformRole,
      PlatformUser,
      Announcement,
      AnnouncementPlan,
      AnnouncementTenant,
      Customer,
      Plan,
      PlanLimit,
      Subscription,
      Announcement,
      Country,
      State,
      City
    ]),
  ],
  controllers: [PlatformController, PlatformUserController, CustomerController, PlanController, SubscriptionController, AnnouncementController, UtilityController],
  providers: [PlatformService, ProvisioningAdminService, TenantDatabaseService, CustomerService, PlatformUserService, PlanService, SubscriptionService, AnnouncementService, UtilityService, MailService, JwtService],
})
export class PlatformModule {}
