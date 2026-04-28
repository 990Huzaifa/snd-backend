import { Controller, Get, UseGuards } from "@nestjs/common";
import { TenantJwtAuthGuard } from "src/auth/tenant-jwt-auth.guard";
import { TenantConnectionGuard } from "src/common/guards/tenant-connection.guard";
import { TenantJwtGuard } from "src/common/guards/tenant-jwt.guard";
import { TenantConnection } from "src/common/tenant/tenant-connection.decorator";
import { DataSource } from "typeorm";
import { TenantUtilityService } from "../service/tenant-utility.service";

@Controller('tenant/lists')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
export class TenantUtilityController {
    constructor(private readonly utilityService: TenantUtilityService) {}

    @Get('designations')
    async getDesignations(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getDesignations(tenantDb);
    }

    @Get('roles')
    async getRoles(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getRoles(tenantDb);
    }

    @Get('permissions')
    async getPermissions(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getPermissions(tenantDb);
    }

}