import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsUUID, ValidateNested } from 'class-validator';
import { UserType } from 'src/tenant-db/entities/user.entity';

export class AssignTargetPlanAssigneeDto {
    @IsEnum(UserType)
    userType: UserType;

    @IsUUID()
    assigneeId: string;
}

export class AssignTargetPlanDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => AssignTargetPlanAssigneeDto)
    assignees: AssignTargetPlanAssigneeDto[];
}
