import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../master-db/entities/tenant.entity';
import { TenantResolverMiddleware } from './middleware/tenant-resolver.middleware';
import { PusherService } from './pusher/pusher.service';

@Module({
    imports: [TypeOrmModule.forFeature([Tenant])],
    providers: [TenantResolverMiddleware, PusherService],
    exports: [TenantResolverMiddleware, PusherService],
})
export class CommonModule { }
