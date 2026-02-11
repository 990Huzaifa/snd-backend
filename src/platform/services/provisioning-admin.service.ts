import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ProvisioningAdminService {
    private adminDataSource: DataSource;

    async createAdminConnection() {
        this.adminDataSource = new DataSource({
            type: 'postgres',
            host: process.env.PROVISION_DB_HOST,
            port: Number(process.env.PROVISION_DB_PORT),
            username: process.env.PROVISION_DB_USER,
            password: process.env.PROVISION_DB_PASS,
            database: process.env.PROVISION_DB_NAME, // usually 'postgres'
            synchronize: false,
        });

        await this.adminDataSource.initialize();
    }

    async closeConnection() {
        if (this.adminDataSource?.isInitialized) {
            await this.adminDataSource.destroy();
        }
    }

    // start from here

    async createDatabase(dbName: string) 
    {
        if (!this.adminDataSource?.isInitialized) {
            throw new Error('Admin connection not initialized');
        }

        await this.adminDataSource.query(
            `CREATE DATABASE "${dbName}";`
        );
    }

    async createUser(username: string, password: string) {
        await this.adminDataSource.query(
            `CREATE USER "${username}" WITH PASSWORD '${password}';`
        );
    }

    async grantPrivileges(dbName: string, username: string) {
        await this.adminDataSource.query(
            `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${username}";`
        );
    }

    getDataSource() {
        return this.adminDataSource;
    }
}
