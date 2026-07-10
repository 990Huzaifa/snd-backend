import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Min,
    ValidateNested,
} from 'class-validator';
import { UserType } from 'src/tenant-db/entities/user.entity';
import { MetricType } from 'src/tenant-db/entities/target-plan.entity';

export class CreateTargetPlanAssigneeDto {
    @IsEnum(UserType)
    userType: UserType;

    @IsUUID()
    assigneeId: string;
}

export class CreateTargetMetricItemDto {
    @IsOptional()
    @IsUUID()
    productId?: string;

    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    targetQuantity?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    targetAmount?: number;
}

export class CreateTargetMetricDto {
    @IsEnum(MetricType)
    metricType: MetricType;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    targetValue: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateTargetMetricItemDto)
    items?: CreateTargetMetricItemDto[];
}

export class CreateTargetPlanDto {
    @IsString()
    cityId: string;

    @IsDateString()
    startDate: string;

    @IsDateString()
    endDate: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateTargetPlanAssigneeDto)
    assignees?: CreateTargetPlanAssigneeDto[];

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CreateTargetMetricDto)
    metrics: CreateTargetMetricDto[];
}
