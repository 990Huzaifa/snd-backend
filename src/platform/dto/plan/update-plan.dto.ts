import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BillingCycle, PlanLimit } from 'src/master-db/entities/plan.entity';

export class UpdatePlanDto {
    
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    @IsOptional()
    stripe_price_id?: string;

    @IsString()
    @IsOptional()
    payfast_price_id?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    currency?: string;

    @IsString()
    @IsOptional()
    price?: string;

    @IsString()
    @IsOptional()
    billing_cycle?: BillingCycle;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @IsBoolean()
    @IsOptional()
    is_display?: boolean;

    @IsOptional()
    @IsString({ each: true })
    plan_limits?: PlanLimit[];

}
