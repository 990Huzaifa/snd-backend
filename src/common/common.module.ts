import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../master-db/entities/tenant.entity';
import { TenantResolverMiddleware } from './middleware/tenant-resolver.middleware';

@Module({
    imports: [TypeOrmModule.forFeature([Tenant])],
    providers: [TenantResolverMiddleware],
    exports: [TenantResolverMiddleware],
})
export class CommonModule { }
