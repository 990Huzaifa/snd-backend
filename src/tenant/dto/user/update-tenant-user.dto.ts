import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserType } from 'src/tenant-db/entities/user.entity';
import { UserLocationItemDto } from './create-tenant-user.dto';

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserLocationItemDto)
  locations?: UserLocationItemDto[];

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;

  @IsOptional()
  joiningDate?: string | null;
}
