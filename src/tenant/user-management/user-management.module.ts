import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TenantRuntimeModule } from 'src/tenant-db/tenant-runtime.module';
import { TenantAuthController } from './tenant-auth.controller';
import { TenantAuthService } from './tenant-auth.service';

@Module({
    imports: [
        HttpModule,
        AuthModule,
        TenantRuntimeModule,
        TypeOrmModule.forFeature([Tenant]),
    ],
    controllers: [TenantAuthController],
    providers: [TenantAuthService],
})
export class UserManagementModule { }