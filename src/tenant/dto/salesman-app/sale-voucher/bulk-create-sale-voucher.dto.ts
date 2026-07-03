import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateSaleVoucherDto } from '../../sale-voucher/create-sale-voucher.dto';

function parseVouchersField(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { vouchers?: unknown }).vouchers)
    ) {
      return (parsed as { vouchers: unknown[] }).vouchers;
    }
    return parsed;
  }
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { vouchers?: unknown }).vouchers)
  ) {
    return (value as { vouchers: unknown[] }).vouchers;
  }
  return value;
}

export class BulkCreateSaleVoucherDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Transform(({ value }) => parseVouchersField(value))
  @Type(() => CreateSaleVoucherDto)
  vouchers: CreateSaleVoucherDto[];
}
