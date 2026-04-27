import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import { CreateTenantUserDto } from '../dto/user/create-tenant-user.dto';
import { InviteTenantUserDto } from '../dto/user/invite-tenant-user.dto';
import { UserService } from '../service/user.service';

@Controller('tenant/users')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard, TenantPermissionGuard)
export class TenantUserController {
  constructor(private readonly userService: UserService) { }

  private buildSetupBaseUrl(req: Request, tenantCode?: string): string {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : (forwardedProto || req.protocol || 'https');

    const forwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : (forwardedHost || req.headers.host || '');

    const [hostOnly, port] = String(hostHeader).split(':');
    const parts = hostOnly.split('.').filter(Boolean);

    if (parts.length < 2) {
      return `${protocol}://${hostHeader}`;
    }

    const first = parts[0]?.toLowerCase();
    const rootDomain = parts.slice(1).join('.');
    const subdomain =
      !first || first === 'api' || first === 'www'
        ? tenantCode
        : parts[0];

    const finalHost = subdomain
      ? `${subdomain}.${rootDomain}${port ? `:${port}` : ''}`
      : hostHeader;

    return `${protocol}://${finalHost}`;
  }

  @Get('')
  @RequirePermissions('LIST_USER')
  list(@TenantConnection() tenantDb: DataSource, @Query('page') page: number = 1, @Query('limit') limit: number = 10, @Query('search') search: string = '', @Query('sort') sort: string = 'createdAt', @Query('sortDirection') sortDirection: string = 'DESC', @Query('roleId') roleId: string = null, @Query('designationId') designationId: string = null) {
    return this.userService.listUsers(tenantDb, page, limit, search, sort, sortDirection, roleId, designationId);
  }

  @Post('')
  @RequirePermissions('CREATE_USER')
  create(@TenantConnection() tenantDb: DataSource, @Body() dto: CreateTenantUserDto,) {
    return this.userService.createUser(tenantDb, dto);
  }

  @Post('invite')
  invite(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: InviteTenantUserDto,
    @Req() req: Request,
  ) {
    const authUser = req.user as {
      tenantCode?: string;
      tenantName?: string;
    };

    return this.userService.inviteUser(
      tenantDb,
      dto,
      authUser?.tenantCode,
      authUser?.tenantName,
      this.buildSetupBaseUrl(req, authUser?.tenantCode),
    );
  }

}
