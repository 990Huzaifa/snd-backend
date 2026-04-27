import { Body, Controller, Headers, Post } from '@nestjs/common';
import { TenantAuthService } from '../service/tenant-auth.service';
import { TenantLoginDto } from '../dto/tenant-login.dto';
import { SetupTenantUserPasswordDto } from '../dto/user/setup-tenant-user-password.dto';

@Controller('tenant/auth')
export class TenantAuthController {
  constructor(private readonly tenantAuthService: TenantAuthService) {}

  @Post('login')
  login(
    @Body() dto: TenantLoginDto,
    @Headers('host') host?: string,
  ): Promise<{ access_token: string }> {
    return this.tenantAuthService.login(dto, host);
  }

  @Post('setup-password')
  setupPassword(
    @Body() dto: SetupTenantUserPasswordDto,
    @Headers('host') host?: string,
  ) {
    return this.tenantAuthService.setupInvitedUserPassword(dto, host);
  }
}
