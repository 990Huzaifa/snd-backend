import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { UpdateSaleOrderDto } from '../../saleorder/update-saleorder.dto';

export const SALESMAN_SALE_ORDER_EDIT_SYNC_MAX = 50;

function parseOrdersField(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { orders?: unknown }).orders)
    ) {
      return (parsed as { orders: unknown[] }).orders;
    }
    return parsed;
  }
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { orders?: unknown }).orders)
  ) {
    return (value as { orders: unknown[] }).orders;
  }
  return value;
}

export class EditSaleOrderSyncDto extends UpdateSaleOrderDto {
  @IsUUID()
  id: string;
}

export class BulkEditSaleOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Transform(({ value }) => parseOrdersField(value))
  @Type(() => EditSaleOrderSyncDto)
  orders: EditSaleOrderSyncDto[];
}
