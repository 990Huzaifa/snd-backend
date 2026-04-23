import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { BillingCycle, PlanLimit } from 'src/master-db/entities/plan.entity';

export class CreatePlanDto {
    
    @IsString()
    title?: string;

    @IsString()
    slug?: string;

    @IsString()
    @IsOptional()
    stripe_price_id?: string;

    @IsString()
    @IsOptional()
    payfast_price_id?: string;

    @IsString()
    description?: string;

    @IsString()
    currency?: string;

    @IsNumber()
    price: string;

    @IsEnum(BillingCycle)
    billing_cycle: BillingCycle;

    @IsBoolean()
    is_active?: boolean;

    @IsBoolean()
    is_display?: boolean;

    @IsOptional()
    @IsString({ each: true })
    plan_limits?: PlanLimit[];

}
