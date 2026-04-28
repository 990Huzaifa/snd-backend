import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TenantRuntimeModule } from 'src/tenant-db/tenant-runtime.module';
import { TenantAuthController } from './controller/tenant-auth.controller';
import { TenantActivityLogController } from './controller/tenant-activity-log.controller';
import { TenantDesignationController } from './controller/tenant-designation.controller';
import { TenantNotificationController } from './controller/tenant-notification.controller';
import { ProductBrandController } from './controller/product-brand.controller';
import { ProductCategoryController } from './controller/product-category.controller';
import { TenantRoleController } from './controller/tenant-role.controller';
import { TenantUserController } from './controller/tenant-user.controller';
import { UomController } from './controller/uom.controller';
import { TenantAuthService } from './service/tenant-auth.service';
import { ActivityLogService } from './service/activity-log.service';
import { TenantDesignationService } from './service/tenant-designation.service';
import { TenantNotificationService } from './service/tenant-notification.service';
import { ProductBrandService } from './service/product-brand.service';
import { ProductCategoryService } from './service/product-category.service';
import { TenantRoleService } from './service/tenant-role.service';
import { UomService } from './service/uom.service';
import { UserService } from './service/user.service';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantUtilityController } from './controller/utility.controller';
import { MailModule } from 'src/common/mail/mail.module';
import { TenantUtilityService } from './service/tenant-utility.service';

@Module({
  imports: [
    HttpModule,
    AuthModule,
    MailModule,
    TenantRuntimeModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [
    TenantAuthController,
    TenantActivityLogController,
    TenantRoleController,
    TenantDesignationController,
    TenantNotificationController,
    ProductBrandController,
    ProductCategoryController,
    UomController,
    TenantUtilityController,
    TenantUserController,
  ],
  providers: [
    TenantAuthService,
    ActivityLogService,
    TenantRoleService,
    TenantDesignationService,
    TenantNotificationService,
    ProductBrandService,
    ProductCategoryService,
    UomService,
    TenantUtilityService,
    UserService,
    TenantPermissionGuard,
  ],
})
export class TenantModule { }