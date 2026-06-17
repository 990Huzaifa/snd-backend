import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { UpdateOrderDeliveryDto } from './update-order-delivery.dto';

export class BulkUpdateLoadsheetOrderDeliveryDto extends UpdateOrderDeliveryDto {
  @IsUUID()
  loadSheetOrderId: string;
}

export class BulkUpdateLoadsheetDeliveryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateLoadsheetOrderDeliveryDto)
  orders: BulkUpdateLoadsheetOrderDeliveryDto[];
}
