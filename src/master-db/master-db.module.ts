import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Tenant } from './entities/tenant.entity';
import { TenantDbConfig } from './entities/tenant-db-config.entity';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'postgres',
                host: config.get('MASTER_DB_HOST'),
                port: Number(config.get('MASTER_DB_PORT')),
                username: config.get('MASTER_DB_USER'),
                password: config.get('MASTER_DB_PASS'),
                database: config.get('MASTER_DB_NAME'),
                autoLoadEntities: true,
                synchronize: false,
            }),
        }),

        // 🔥 THIS LINE IS THE REAL FIX
        TypeOrmModule.forFeature([Tenant, TenantDbConfig]),
    ],
})
export class MasterDbModule { }
