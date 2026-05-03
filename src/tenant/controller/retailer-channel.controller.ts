import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode, TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { RetailerChannelService } from '../service/retailer-channel.service';
import { CreateRetailerChannelDto } from '../dto/retailer-channel/create-retailer-channel.dto';

@Controller('tenant/retailer-channels')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class RetailerChannelController {
  constructor(private readonly retailerChannelService: RetailerChannelService) {}

  @Post('create')
  @RequirePermissions('CREATE_RETAILER_CHANNEL')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateRetailerChannelDto,
    @Req() req: Request,
  ) {
    return this.retailerChannelService.create(tenantDb, dto, req.user);
  }

  @Post('import')
  @RequirePermissions('CREATE_RETAILER_CHANNEL')
  @UseInterceptors(FileInterceptor('file'))
  importChannels(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    return this.retailerChannelService.importChannels(tenantDb, file, req.user, tenantCode);
  }

  @Get()
  @RequirePermissions('LIST_RETAILER_CHANNEL')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.retailerChannelService.list(tenantDb, page, limit, search, req.user);
  }

  @Get(':id')
  @RequirePermissions('VIEW_RETAILER_CHANNEL')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.retailerChannelService.view(tenantDb, id, req.user);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_RETAILER_CHANNEL')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.retailerChannelService.delete(tenantDb, id, req.user);
  }
}
