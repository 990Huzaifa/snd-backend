import { Injectable } from '@nestjs/common';
import { TenantDataSource } from '../tenant-datasource.factory';

@Injectable()
export class TenantDatabaseService {
    async runMigrations(
        host: string,
        port: number,
        username: string,
        password: string,
        database: string,
    ) {
        const dataSource = TenantDataSource(
            host,
            port,
            username,
            password,
            database,
        );

        await dataSource.initialize();
        await dataSource.runMigrations();
        await dataSource.destroy();
    }
}
