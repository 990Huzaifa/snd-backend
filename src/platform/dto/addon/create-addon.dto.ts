import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsBoolean,
    IsEnum,
} from 'class-validator';
import { BillingCycle } from 'src/master-db/entities/addon.entity';

export class CreateAddonDto {

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsString()
    stripe_price_id?: string;

    @IsOptional()
    @IsString()
    payfast_price_id?: string;

    @IsString()
    @IsNotEmpty()
    slug: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsNumber()
    price: string;

    @IsEnum(BillingCycle)
    billing_cycle: BillingCycle;

    @IsString()
    @IsNotEmpty()
    limitKey: string;

    @IsNumber()
    limitValue: number;

    @IsString()
    @IsNotEmpty()
    currency: string;

    @IsBoolean()
    is_active: boolean;
}