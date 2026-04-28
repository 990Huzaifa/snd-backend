import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TenantRuntimeModule } from 'src/tenant-db/tenant-runtime.module';
import { TenantAuthController } from './controller/tenant-auth.controller';
import { TenantDesignationController } from './controller/tenant-designation.controller';
import { TenantRoleController } from './controller/tenant-role.controller';
import { TenantUserController } from './controller/tenant-user.controller';
import { TenantAuthService } from './service/tenant-auth.service';
import { TenantDesignationService } from './service/tenant-designation.service';
import { TenantRoleService } from './service/tenant-role.service';
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
    TenantRoleController,
    TenantDesignationController,
    TenantUtilityController,
    TenantUserController,
  ],
  providers: [
    TenantAuthService,
    TenantRoleService,
    TenantDesignationService,
    TenantUtilityService,
    UserService,
    TenantPermissionGuard,
  ],
})
export class TenantModule { }