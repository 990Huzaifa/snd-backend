import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { ResolveTenantDto } from './dto/resolve-tenant.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('platform/tenant')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Post('resolve')
  async resolve(@Body() dto: ResolveTenantDto) {
    const tenant = await this.platformService.resolveTenant(dto.code);

    if(!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const domain = process.env.DOMAIN; 
    return {
      tenantCode: tenant.code,
      tenantName: tenant.name,
      appUrl: `https://${tenant.name}.${domain}`,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createTenant(@Body() dto: CreateTenantDto) {
    const tenant = await this.platformService.createTenant(dto);

    return {
      tenantName: tenant.name,
      email: tenant.email,
      tenantCode: tenant.code,
      appUrl: `https://${tenant.name}.${process.env.DOMAIN}`,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/retry-provisioning')
  async retryTenantProvisioning(@Param('id') tenantId: string) {
    return this.platformService.retryProvisioning(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/provisioning')
  async provisioning() {
    return this.platformService.getProvisioningList();
  }

  @UseGuards(JwtAuthGuard)
  @Get('/provisioning/:id')
  async provisioningDetails(@Param('id') id: string) {
    return this.platformService.getProvisioningDetails(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/suspend')
  async suspend(@Param('id') id: string) {
    return this.platformService.suspendTenant(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/resume')
  async resume(@Param('id') id: string) {
    return this.platformService.resumeTenant(id);
  }

}
