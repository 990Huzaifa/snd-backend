import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsOptional,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { CreateTargetMetricDto } from './create-target-plan.dto';

export class UpdateTargetPlanDto {
    @IsOptional()
    @IsString()
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
