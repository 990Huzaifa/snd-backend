import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PlanLimit } from 'src/master-db/entities/plan.entity';

export class UpdatePlan {
    
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
    monthly_price?: number;

    @IsString()
    @IsOptional()
    yearly_price?: number;

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
