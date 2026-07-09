import { IsEnum } from 'class-validator';
import { TargetPlanStatus } from 'src/tenant-db/entities/target-plan.entity';

export class UpdateTargetPlanStatusDto {
    @IsEnum(TargetPlanStatus)
    status: TargetPlanStatus;
}
