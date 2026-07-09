import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { TargetPlanService } from '../service/target-plan.service';
import { CreateTargetPlanDto } from '../dto/target-plan/create-target-plan.dto';
import { UpdateTargetPlanDto } from '../dto/target-plan/update-target-plan.dto';
import { ListTargetPlanDto } from '../dto/target-plan/list-target-plan.dto';
import { UpdateTargetPlanStatusDto } from '../dto/target-plan/update-target-plan-status.dto';
import { AssignTargetPlanDto } from '../dto/target-plan/assign-target-plan.dto';
import { RemoveTargetPlanAssigneesDto } from '../dto/target-plan/remove-target-plan-assignees.dto';

@Controller('tenant/target-plans')
@UseGuards(
    TenantJwtAuthGuard,
    TenantJwtGuard,
    TenantConnectionGuard,
    TenantPermissionGuard,
)
export class TargetPlanController {
    constructor(private readonly targetPlanService: TargetPlanService) {}

    @Get()
    @RequirePermissions('LIST_TARGET_PLAN')
    list(
        @TenantConnection() tenantDb: DataSource,
        @Query() query: ListTargetPlanDto,
        @Req() req: Request,
    ) {
        return this.targetPlanService.list(
            tenantDb,
            query,
            req.user as { userId: string },
        );
    }

    @Post('create')
    @RequirePermissions('CREATE_TARGET_PLAN')
    create(
        @TenantConnection() tenantDb: DataSource,
        @Body() dto: CreateTargetPlanDto,
        @Req() req: Request,
    ) {
        return this.targetPlanService.create(
            tenantDb,
            dto,
            req.user as { userId: string },
        );
    }

    @Put('update/:id')
    @RequirePermissions('UPDATE_TARGET_PLAN')
    edit(
        @TenantConnection() tenantDb: DataSource,
        @Param('id') id: string,
        @Body() dto: UpdateTargetPlanDto,
        @Req() req: Request,
    ) {
        return this.targetPlanService.edit(
            tenantDb,
            id,
            dto,
            req.user as { userId: string },
        );
    }

    @Put('assign/:id')
    @RequirePermissions('UPDATE_TARGET_PLAN')
    assign(
        @TenantConnection() tenantDb: DataSource,
        @Param('id') id: string,
        @Body() dto: AssignTargetPlanDto,
        @Req() req: Request,
    ) {
        return this.targetPlanService.assignAssignees(
            tenantDb,
            id,
            dto,
            req.user as { userId: string },
        );
    }

    @Put('assign/:id/remove')
    @RequirePermissions('UPDATE_TARGET_PLAN')
    removeAssignees(
        @TenantConnection() tenantDb: DataSource,
        @Param('id') id: string,
        @Body() dto: RemoveTargetPlanAssigneesDto,
        @Req() req: Request,
    ) {
        return this.targetPlanService.removeAssignees(
            tenantDb,
            id,
            dto,
            req.user as { userId: string },
        );
    }

    @Put('update/:id/status')
    @RequirePermissions('UPDATE_TARGET_PLAN_STATUS')
    updateStatus(
        @TenantConnection() tenantDb: DataSource,
        @Param('id') id: string,
        @Body() dto: UpdateTargetPlanStatusDto,
        @Req() req: Request,
    ) {
        return this.targetPlanService.updateStatus(
            tenantDb,
            id,
            dto,
            req.user as { userId: string },
        );
    }

    @Post(':id/recalculate')
    @RequirePermissions('RECALCULATE_TARGET_PLAN')
    recalculate(
        @TenantConnection() tenantDb: DataSource,
        @Param('id') id: string,
        @Req() req: Request,
    ) {
        return this.targetPlanService.recalculateAchievements(
            tenantDb,
            id,
            req.user as { userId: string },
        );
    }

    @Get(':id')
    @RequirePermissions('VIEW_TARGET_PLAN')
    view(
        @TenantConnection() tenantDb: DataSource,
        @Param('id') id: string,
        @Req() req: Request,
    ) {
        return this.targetPlanService.view(
            tenantDb,
            id,
            req.user as { userId: string },
        );
    }

    @Delete(':id')
    @RequirePermissions('DELETE_TARGET_PLAN')
    delete(
        @TenantConnection() tenantDb: DataSource,
        @Param('id') id: string,
        @Req() req: Request,
    ) {
        return this.targetPlanService.delete(
            tenantDb,
            id,
            req.user as { userId: string },
        );
    }
}
