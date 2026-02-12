import { DataSource } from 'typeorm';
import * as path from 'path';

export function createTenantDataSource(
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
) {
    return new DataSource({
        type: 'postgres',
        host,
        port,
        username,
        password,
        database,
        entities: [
            path.join(__dirname, 'entities/**/*.js')
        ],

        migrations: [
            path.join(__dirname, 'migrations/**/*.js')
        ],
    });
}
