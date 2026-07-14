import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSaleReturnItemDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  productFlavourId: string;

  @IsUUID()
  productPricingId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderedQuantity?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  returnedQuantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total: number;

  @IsString()
  returnReason: string;
}
