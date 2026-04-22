import { IsOptional, IsEnum, IsUUID, IsBoolean } from 'class-validator';
import { GeoScopeType } from 'src/master-db/entities/tenant-geo-policy.entity';

export class UpdateTenantGeoPolicyDto {
    @IsOptional()
    @IsEnum(GeoScopeType)
    scope_type?: GeoScopeType;

    @IsOptional()
    @IsUUID()
    country_id?: string | null;

    @IsOptional()
    @IsUUID()
    state_id?: string | null;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
