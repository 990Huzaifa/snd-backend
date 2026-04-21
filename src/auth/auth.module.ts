import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformRole } from 'src/master-db/entities/platform-role.entity';
import { PlatformUser } from 'src/master-db/entities/platform-user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { CustomerJwtStrategy } from './customer-jwt.strategy';
import { Customer } from 'src/master-db/entities/customer.entity';
import { MailService } from 'src/common/mail/mail.service';
import { HttpModule } from '@nestjs/axios';
import { PusherService } from 'src/common/pusher/pusher.service';

@Module({
    imports: [
        HttpModule,
        TypeOrmModule.forFeature([PlatformUser, PlatformRole,Customer]),
        ConfigModule,
        PassportModule,
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get('JWT_SECRET'),
                signOptions: {
                    expiresIn: config.get('JWT_EXPIRES_IN'),
                },
            }),
        })
    ],
    providers: [AuthService,JwtStrategy, CustomerJwtStrategy, MailService, PusherService],
    controllers: [AuthController],
})
export class AuthModule {}
