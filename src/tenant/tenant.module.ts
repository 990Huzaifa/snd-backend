import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [
        HttpModule,
        TypeOrmModule.forFeature([

        ])
    ],
    controllers: [],
    providers: [],
})
export class TenantModule { }