import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { ChangeProfilePasswordDto } from '../dto/profile/change-profile-password.dto';
import { ProfileService } from '../service/profile.service';

type TenantRequestUser = {
  userId?: string;
};

@Controller('tenant/profile')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  private getUserId(req: Request): string {
    const user = req.user as TenantRequestUser;
    if (!user?.userId) {
      throw new UnauthorizedException('Tenant user not found in request');
    }
    return user.userId;
  }

  @Get()
  getProfile(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
    return this.profileService.getProfile(tenantDb, this.getUserId(req));
  }

  @Patch('password')
  changePassword(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: ChangeProfilePasswordDto,
    @Req() req: Request,
  ) {
    return this.profileService.changePassword(
      tenantDb,
      this.getUserId(req),
      dto,
    );
  }
}
