import { Controller, Get, UseGuards } from "@nestjs/common";
import { TenantJwtAuthGuard } from "src/auth/tenant-jwt-auth.guard";
import { TenantJwtGuard } from "src/common/guards/tenant-jwt.guard";
import { TenantConnectionGuard } from "src/common/guards/tenant-connection.guard";
import { TenantConnection } from "src/common/tenant/tenant-connection.decorator";
import { DataSource } from "typeorm";
import { TenantRoleService } from "../service/tenant-role.service";

@Controller('tenant/permissions')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
export class TenantPermissionController {
    constructor(private readonly tenantRoleService: TenantRoleService) {}

    @Get()
    list(@TenantConnection() tenantDb: DataSource) {
        return this.tenantRoleService.permissionsList(tenantDb);
    }

}