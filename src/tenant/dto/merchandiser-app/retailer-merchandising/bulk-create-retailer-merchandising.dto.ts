import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateRetailerMerchandisingItemDto {
  @IsUUID()
  retailerId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

function parseMerchandisingField(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { entries?: unknown }).entries)
    ) {
      return (parsed as { entries: unknown[] }).entries;
    }
    return parsed;
  }
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { entries?: unknown }).entries)
  ) {
    return (value as { entries: unknown[] }).entries;
  }
  return value;
}

export class BulkCreateRetailerMerchandisingDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Transform(({ value }) => parseMerchandisingField(value))
  @Type(() => CreateRetailerMerchandisingItemDto)
  entries: CreateRetailerMerchandisingItemDto[];
}
