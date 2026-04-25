import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UserManagementModule } from './user-management/user-management.module';

@Module({
    imports: [HttpModule, UserManagementModule],
    controllers: [],
    providers: [],
})
export class TenantModule { }