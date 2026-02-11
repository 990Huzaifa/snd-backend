import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, UseGuards, Put, UseInterceptors, UploadedFile } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { ResolveTenantDto } from './dto/resolve-tenant.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateTenantThemeDto } from './dto/update-tenant-theme.dto';

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


  @UseGuards(JwtAuthGuard)
  @Get(':id/profile')
  async getProfile(@Param('id') id: string) {
    return this.platformService.getTenantProfile(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/profile')
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateTenantProfileDto) {
    return this.platformService.updateTenantProfile(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/settings')
  async getSettings(@Param('id') id: string) {
    return this.platformService.getTenantSettings(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/settings')
  async updateSettings(@Param('id') id: string, @Body() dto: UpdateTenantSettingsDto) {
    return this.platformService.updateTenantSettings(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/themes')
  async getThemes(@Param('id') id: string) {
    return this.platformService.getTenantThemes(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/themes')
  async getTheme(@Param('id') id: string, @Body() dto: UpdateTenantThemeDto) {
    return this.platformService.updateTenantThemes(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/profile/logo')
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(@Param('id') id: string, @UploadedFile() logo: Express.Multer.File) {
    return this.platformService.updateTenantLogo(id, logo);
  }

}
