import { IsString, Matches, Length, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { BillingCycle } from 'src/master-db/entities/subscription.entity';
import { IndustryType } from 'src/master-db/entities/tenant.entity';

export class CreateTenantDto {
    // 🌐 subdomain
    @IsString()
    @Matches(/^[a-z][a-z0-9-]+$/, {
        message: 'Tenant name must be a valid subdomain',
    })
    @Length(2, 30)
    name: string;
    
    @IsEmail()
    email: string;

    @IsOptional()
    @IsEnum(IndustryType)
    industryType?: IndustryType;

    @IsOptional()
    @IsString()
    planId?: string


    @IsEnum(BillingCycle)
    billingCycle: BillingCycle;
}
