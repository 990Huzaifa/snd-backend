import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Plan, PlanLimit } from "src/master-db/entities/plan.entity";
import { Not, Repository } from "typeorm";
import { CreatePlanDto } from "../dto/plan/create-plan.dto";
import { UpdatePlanDto } from "../dto/plan/update-plan.dto";
import { ActivityLogService } from "./activity-log.service";
import { ActivityLogActorType } from "src/master-db/entities/activity-log.entity";

@Injectable()
export class PlanService {
    constructor(
        @InjectRepository(Plan)
        private readonly planRepo: Repository<Plan>,
        @InjectRepository(PlanLimit)
        private readonly planLimitRepo: Repository<PlanLimit>,
        private readonly activityLogService: ActivityLogService,
    ) { }

    private async recordAction(action: string, description: string, actorId: string, metadata?: Record<string, any>) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId: actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }

    async getPlans(page = 1, limit = 10, user: any) {
        const skip = (page - 1) * limit;
        const plans = await this.planRepo.find({
            skip: skip,
            take: limit,
            order: { createdAt: 'ASC' },
            relations: ['plan_limits']
        });
        await this.recordAction('PLAN_LIST', 'Plan list fetched', user.id, { page, limit, count: plans.length });
        return {
            data: plans,
            meta: {
                page: page,
                limit: limit,
            },
        };
    }

    async showPlan(id: string, user: any) {
        console.log('Fetching plan with id:', id);
        const plan = await this.planRepo.findOne({
            where: { id: id },
            relations: ['plan_limits']
        });
        if (!plan) {
            throw new NotFoundException('Plan not found');
        }
        await this.recordAction('PLAN_SHOW', 'Plan details fetched', user.id, { planId: id });
        return plan;
    }

    async createPlan(createPlanDto: CreatePlanDto, user: any) {
        const planExists = await this.planRepo.findOne({ where: { slug: createPlanDto.slug } });
        if (planExists) {
            throw new ConflictException('Plan already exists');
        }

        const plan = await this.planRepo.save(
            this.planRepo.create({
                title: createPlanDto.title,
                slug: createPlanDto.slug,
                stripe_price_id: createPlanDto.stripe_price_id || null,
                payfast_price_id: createPlanDto.payfast_price_id || null,
                description: createPlanDto.description,
                currency: createPlanDto.currency,
                price: createPlanDto.price,
                billing_cycle: createPlanDto.billing_cycle,
                is_active: createPlanDto.is_active,
                is_display: createPlanDto.is_display,
            }),
        );

        // Check if 'limits' is an array before proceeding
        if (Array.isArray(createPlanDto.plan_limits)) {
            // Use for...of to properly await async operations
            for (const limit of createPlanDto.plan_limits) {
                const planLimit = this.planLimitRepo.create({
                    plan: plan,  // Use the created plan directly
                    limitKey: limit.limitKey,
                    limitValue: limit.limitValue,
                });
                await this.planLimitRepo.save(planLimit);
            }
        } else if (createPlanDto.plan_limits) {
            // If limits is not an array, handle the error case
            throw new BadRequestException('Limits should be an array');
        }
        await this.recordAction('PLAN_CREATE', 'Plan created', user.id, { planId: plan.id, slug: plan.slug });
        return plan;
    }

    async updatePlan(id: string, updatePlanDto: UpdatePlanDto, user: any) {
        // Find the existing plan along with its limits
        const plan = await this.planRepo.findOne({ where: { id: id }, relations: ['plan_limits'] });

        if (!plan) {
            throw new NotFoundException('Plan not found');
        }

        // Check if the slug is being changed and whether the new slug already exists (excluding current plan)
        if (updatePlanDto.slug && updatePlanDto.slug !== plan.slug) {
            const slugExists = await this.planRepo.findOne({
                where: { slug: updatePlanDto.slug, id: Not(id) }, // Exclude the current plan's ID
            });
            if (slugExists) {
                throw new ConflictException('Plan slug already exists');
            }
        }

        // Update the plan properties
        Object.assign(plan, updatePlanDto);

        // Handle limits update (adding new limits or updating existing ones)
        if (Array.isArray(updatePlanDto.plan_limits)) {
            for (const limit of updatePlanDto.plan_limits) {
                // Check if the limit already exists for the given plan
                const existingLimit = plan.plan_limits.find(
                    (pl) => pl.limitKey === limit.limitKey
                );

                if (existingLimit) {
                    // If the limit exists, update it
                    existingLimit.limitValue = limit.limitValue;
                    await this.planLimitRepo.save(existingLimit);
                } else {
                    // If the limit does not exist, create a new one
                    const planLimit = this.planLimitRepo.create({
                        plan: plan,  // Use the current plan
                        limitKey: limit.limitKey,
                        limitValue: limit.limitValue,
                    });
                    await this.planLimitRepo.save(planLimit);
                }
            }
        }

        // Save the updated plan
        await this.planRepo.save(plan);
        await this.recordAction('PLAN_UPDATE', 'Plan updated', user.id, { planId: id });

        return plan;
    }

    async updatePlanStatus(id: string, is_active: boolean, user: any) {
        const plan = await this.planRepo.findOne({ where: { id: id } });
        if (!plan) {
            throw new NotFoundException('Plan not found');
        }
        plan.is_active = is_active;
        await this.planRepo.update({ id: id }, plan);
        await this.recordAction('PLAN_STATUS_UPDATE', 'Plan status updated', user.id, { planId: id, isActive: is_active });
        return plan;
    }
}