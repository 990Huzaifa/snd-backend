import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PlanLimit } from 'src/master-db/entities/plan.entity';

export class CreatePlan {
    
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

    @IsString()
    @IsOptional()
    monthly_price?: number;

    @IsString()
    @IsOptional()
    yearly_price?: number;

    @IsBoolean()
    is_active?: boolean;

    @IsBoolean()
    is_display?: boolean;

    @IsOptional()
    @IsString({ each: true })
    limits?: PlanLimit[];

}
