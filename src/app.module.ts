import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app/app-config.module';
import { MasterDbModule } from './master-db/master-db.module';
import { PlatformModule } from './platform/platform.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    MasterDbModule,
    CommonModule,
    AuthModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
