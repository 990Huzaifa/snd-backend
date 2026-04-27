import { Controller, Get, UseGuards } from "@nestjs/common";
import { TenantJwtAuthGuard } from "src/auth/tenant-jwt-auth.guard";
import { TenantConnectionGuard } from "src/common/guards/tenant-connection.guard";
import { TenantJwtGuard } from "src/common/guards/tenant-jwt.guard";

@Controller('tenant')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
export class TenantUtilityController {

}