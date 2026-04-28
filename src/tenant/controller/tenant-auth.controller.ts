import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { TenantAuthService } from '../service/tenant-auth.service';
import { TenantLoginDto } from '../dto/tenant-login.dto';
import { SetupTenantUserPasswordDto } from '../dto/user/setup-tenant-user-password.dto';

const getRequestHeader = (req: Request, names: string[]): string | undefined => {
  for (const name of names) {
    const value = req.headers[name];
    if (!value) {
      continue;
    }
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (headerValue) {
      return headerValue.split(',')[0].trim();
    }
  }
  return undefined;
};

const resolveTenantHost = (
  origin?: string,
  referer?: string,
  host?: string,
): string | undefined => {
  const source = origin || referer;
  if (!source) {
    return host;
  }

  try {
    return new URL(source).host;
  } catch {
    return host;
  }
};

@Controller('tenant/auth')
export class TenantAuthController {
  constructor(private readonly tenantAuthService: TenantAuthService) {}

  @Post('login')
  login(
    @Body() dto: TenantLoginDto,
    @Req() req: Request,
  ): Promise<{ access_token: string }> {
    const origin = getRequestHeader(req, ['origin', 'x-forwarded-origin']);
    console.log('this is origin', origin);
    const referer = getRequestHeader(req, ['referer']);
    const host = getRequestHeader(req, ['x-original-host', 'x-forwarded-host', 'host']);
    return this.tenantAuthService.login(dto, resolveTenantHost(origin, referer, host));
  }

  @Post('setup-password')
  setupPassword(
    @Body() dto: SetupTenantUserPasswordDto,
    @Req() req: Request,
  ) {
    const origin = getRequestHeader(req, ['origin', 'x-forwarded-origin']);
    const referer = getRequestHeader(req, ['referer']);
    const host = getRequestHeader(req, ['x-original-host', 'x-forwarded-host', 'host']);
    return this.tenantAuthService.setupInvitedUserPassword(
      dto,
      resolveTenantHost(origin, referer, host),
    );
  }
}
