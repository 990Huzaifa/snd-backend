import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class UpdateOrderDeliveryItemDto {
  @IsUUID()
  loadSheetOrderItemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveredQuantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shortQuantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returnedQuantity: number;
}
