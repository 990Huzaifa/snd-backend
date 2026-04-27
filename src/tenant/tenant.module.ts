import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TenantRuntimeModule } from 'src/tenant-db/tenant-runtime.module';
import { TenantAuthController } from './controller/tenant-auth.controller';
import { TenantRoleController } from './controller/tenant-role.controller';
import { TenantAuthService } from './service/tenant-auth.service';
import { TenantRoleService } from './service/tenant-role.service';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantPermissionController } from './controller/tenant-permission.controller';
import { UtilityController } from 'src/platform/controller/utility.controller';

@Module({
  imports: [
    HttpModule,
    AuthModule,
    TenantRuntimeModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [TenantAuthController, TenantRoleController, TenantPermissionController, UtilityController],
  providers: [TenantAuthService, TenantRoleService, TenantPermissionGuard],
})
export class TenantModule { }