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
    );
  }

}
