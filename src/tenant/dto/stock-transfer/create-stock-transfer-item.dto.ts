import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateStockTransferItemDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  productFlavourId: string;

  @IsUUID()
  productPricingId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
