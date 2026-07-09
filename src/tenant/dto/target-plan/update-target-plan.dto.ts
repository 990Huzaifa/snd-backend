import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsOptional,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { CreateTargetMetricDto } from './create-target-plan.dto';

export class UpdateTargetPlanDto {
    @IsOptional()
    @IsUUID()
    cityId?: string;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateTargetMetricDto)
    metrics?: CreateTargetMetricDto[];
}
