import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SubscriptionService } from "../services/subscription.service";
import { PermissionGuard } from "src/auth/permission.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { CurrentPlatformUser } from "src/auth/current-platform-user.decorator";

@Controller('platform/subscription')
@UseGuards(JwtAuthGuard, PermissionGuard)   
export class SubscriptionController {
    constructor(
        private readonly subscriptionService: SubscriptionService,
    ) {}

    @Get('/')
    async getSubscriptions(@Query('page') page: number = 1, @Query('limit') limit: number = 10, @CurrentPlatformUser() user: any) {
        return this.subscriptionService.getSubscriptions(page, limit, user.id);
    }
}