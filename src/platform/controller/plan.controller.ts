import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { PlanService } from "../services/plan.service";
import { PermissionGuard } from "src/auth/permission.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RequirePermissions } from "src/auth/require-permission.decorator";

@Controller("platform/plan")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PlanController {
    constructor(private readonly planService: PlanService) {}
    
    @RequirePermissions('PLAN_LIST')
    @Get('/')
    async getPlans() {
        return this.planService.getPlans();
    }

    @RequirePermissions('PLAN_VIEW')
    @Get('/:id')
    async showPlan(id: string) {
        return this.planService.showPlan(id);
    }

    @RequirePermissions('PLAN_CREATE')
    @Post('/')
    async createPlan(@Body() createPlanDto: any) {
        return this.planService.createPlan(createPlanDto);
    }

    @RequirePermissions('PLAN_UPDATE')
    @Post('/:id')
    async updatePlan(@Body() updatePlanDto: any, id: string) {
        return this.planService.updatePlan(id, updatePlanDto);
    }

    @RequirePermissions('PLAN_UPDATE')
    @Post('/:id/status')
    async updatePlanStatus(@Body() updatePlanDto: any, id: string) {
        return this.planService.updatePlanStatus(id, updatePlanDto.is_active);
    }
}