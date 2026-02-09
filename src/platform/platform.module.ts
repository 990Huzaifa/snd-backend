import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { Tenant } from '../master-db/entities/tenant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]), // 🔥 THIS IS THE KEY
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
