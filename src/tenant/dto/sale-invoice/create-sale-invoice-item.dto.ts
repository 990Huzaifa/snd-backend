import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateSaleInvoiceItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  productFlavourId: number;

  @IsUUID()
  productPricingId: string;

  @IsOptional()
  @IsUUID()
  schemeId?: string;

  @IsOptional()
  @IsUUID()
  slabId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freeQuantity?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subTotalAmount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount: number;
}
