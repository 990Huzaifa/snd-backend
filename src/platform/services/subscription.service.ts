import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Subscription } from "src/master-db/entities/subscription.entity";
import { Repository } from "typeorm";

@Injectable()
export class SubscriptionService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
    ) {
    }

    async getSubscriptions(page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;
        const [subscriptions, total] = await this.subscriptionRepo.findAndCount({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
            relations: ['plan', 'tenant'],
        });
        return {
            data: subscriptions,
            meta: {
                total,
                page,
                limit,
            },
        };
    }

    async getSubscriptionById(id: number) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { id },
            relations: ['plan', 'tenant'],
        });
        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }
        return subscription;
    }

}