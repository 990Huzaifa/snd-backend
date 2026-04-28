import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateDistributorDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsString()
  stateId?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsUUID()
  areaId: string;

  @IsString()
  postalCode: string;

  @IsString()
  locationTitle: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  maxRadius: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
