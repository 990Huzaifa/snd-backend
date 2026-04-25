import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserManagementModule } from './user-management/user-management.module';

@Module({
    imports: [
        HttpModule,
        TypeOrmModule.forFeature([

        ]),
        UserManagementModule
    ],
    controllers: [],
    providers: [],
})
export class TenantModule { }