import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateProductPricingDto {
  @IsUUID()
  uomId: string;

  @IsString()
  tradePrice: string;

  @IsString()
  retailPrice: string;

  @IsInt()
  quantity: number;

  @IsOptional()
  @IsString()
  gst?: string;

  @IsOptional()
  @IsString()
  offer?: string;
}

class UpdateProductFlavourDto {
  @IsUUID()
  flavourId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  productFlavourSku?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  skuCode?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  hsCode?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assetIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductFlavourDto)
  flavours?: UpdateProductFlavourDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductPricingDto)
  pricing?: UpdateProductPricingDto[];
}
