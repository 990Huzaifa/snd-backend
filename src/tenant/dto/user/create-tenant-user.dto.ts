import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserType } from 'src/tenant-db/entities/user.entity';

export class UserLocationItemDto {
  @IsOptional()
  @IsString()
  locationTitle?: string;

  @IsString()
  @MinLength(1)
  latitude: string;

  @IsString()
  @MinLength(1)
  longitude: string;

  @IsString()
  @MinLength(1)
  maxRadius: string;
}

export class CreateTenantUserDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(1)
  roleId: string;

  @IsEnum(UserType)
  type: UserType;

  @IsOptional()
  @IsInt()
  designationId?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  cnic?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  avatarAssetId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsString()
  stateId?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  joiningDate?: string;

  @IsOptional()
  @IsString()
  leavingDate?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserLocationItemDto)
  locations?: UserLocationItemDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
