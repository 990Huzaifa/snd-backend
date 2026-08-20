import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateProductPricingDto {
  @IsUUID()
  uomId: string;

  @IsString()
  tradePrice: string;

  @IsString()
  retailPrice: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  gst?: string;

  @IsOptional()
  @IsString()
  offer?: string;
}

class CreateProductFlavourDto {
  @IsUUID()
  flavourId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  productFlavourSku?: string;
}

export class CreateProductDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  skuCode: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  hsCode?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString()
  image?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assetIds?: string[];

  @IsBoolean()
  isActive: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductFlavourDto)
  flavours: CreateProductFlavourDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductPricingDto)
  pricing: CreateProductPricingDto[];
}
