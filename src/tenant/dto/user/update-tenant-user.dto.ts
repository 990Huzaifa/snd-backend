import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserType } from 'src/tenant-db/entities/user.entity';

export class UpdateTenantUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  designationId?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  cnic?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  countryId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  stateId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  cityId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  locationTitle?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  latitude?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  longitude?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  maxRadius?: string | null;

  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;

  @IsOptional()
  joiningDate?: string | null;
}
