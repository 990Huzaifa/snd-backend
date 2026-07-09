import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateSaleReturnDto } from '../../sale-return/create-sale-return.dto';

export const SALESMAN_SALE_RETURN_SYNC_MAX = 50;

function parseReturnsField(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { returns?: unknown }).returns)
    ) {
      return (parsed as { returns: unknown[] }).returns;
    }
    return parsed;
  }
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { returns?: unknown }).returns)
  ) {
    return (value as { returns: unknown[] }).returns;
  }
  return value;
}

export class BulkCreateSaleReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Transform(({ value }) => parseReturnsField(value))
  @Type(() => CreateSaleReturnDto)
  returns: CreateSaleReturnDto[];
}
