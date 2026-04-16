import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SubscriptionService } from "../services/subscription.service";
import { PermissionGuard } from "src/auth/permission.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";

@Controller('platform/subscription')
@UseGuards(JwtAuthGuard, PermissionGuard)   
export class SubscriptionController {
    constructor(
        private readonly subscriptionService: SubscriptionService,
    ) {}

    @Get('/')
    async getSubscriptions(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
        return this.subscriptionService.getSubscriptions(page, limit);
    }
}