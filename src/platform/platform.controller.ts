import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { ResolveTenantDto } from './dto/resolve-tenant.dto';

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

}
