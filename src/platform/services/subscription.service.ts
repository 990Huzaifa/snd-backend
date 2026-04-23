import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Subscription } from "src/master-db/entities/subscription.entity";
import { Repository } from "typeorm";
import { ActivityLogService } from "./activity-log.service";
import { ActivityLogActorType } from "src/master-db/entities/activity-log.entity";

@Injectable()
export class SubscriptionService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        private readonly activityLogService: ActivityLogService,
    ) {
    }

    private async recordAction(action: string, description: string, actorId:string , metadata?: Record<string, any> ) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId: actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }

    async getSubscriptions(page: number = 1, limit: number = 10, userId:string) {
        const skip = (page - 1) * limit;
        const [subscriptions, total] = await this.subscriptionRepo.findAndCount({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
        });
        await this.recordAction('SUBSCRIPTION_LIST', 'Subscription list fetched', userId, { page, limit, total });
        return {
            data: subscriptions,
            meta: {
                total,
                page,
                limit,
            },
        };
    }

    async getSubscriptionById(id: number, userId:string) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { id },
            relations: ['plan', 'tenant', 'subscriptionAddons'],
        });
        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }
        await this.recordAction('SUBSCRIPTION_GET', 'Subscription fetched', userId, { subscriptionId: id });
        return subscription;
    }

}