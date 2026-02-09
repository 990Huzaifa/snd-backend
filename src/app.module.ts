import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app/app-config.module';
import { MasterDbModule } from './master-db/master-db.module';
import { PlatformModule } from './platform/platform.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    AppConfigModule,
    MasterDbModule,
    CommonModule,
    AuthModule,
    PlatformModule,
  ],
})
export class AppModule {}
