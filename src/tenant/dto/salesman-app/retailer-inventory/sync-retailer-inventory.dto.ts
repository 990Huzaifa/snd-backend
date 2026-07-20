import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RetailerInventoryType } from 'src/tenant-db/entities/retailer.entity';

export const SALESMAN_RETAILER_INVENTORY_SYNC_MAX = 50;

export class SyncRetailerInventoryItemDto {
  @IsEnum(RetailerInventoryType)
  type: RetailerInventoryType;

  @IsUUID()
  retailerId: string;

  @IsUUID()
  productId: string;

  @IsUUID()
  productFlavourId: string;

  @IsUUID()
  uomId: string;

  /** When true, deletes the matching inventory row (no-op if missing). */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') {
      return true;
    }
    if (value === 'false' || value === false || value === 0 || value === '0') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  remove?: boolean;

  /** Required when `remove` is not true. Upserts quantity for the composite key. */
  @ValidateIf((o: SyncRetailerInventoryItemDto) => o.remove !== true)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;
}

function parseInventoriesField(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { inventories?: unknown }).inventories)
    ) {
      return (parsed as { inventories: unknown[] }).inventories;
    }
    return parsed;
  }
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { inventories?: unknown }).inventories)
  ) {
    return (value as { inventories: unknown[] }).inventories;
  }
  return value;
}

export class BulkSyncRetailerInventoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Transform(({ value }) => parseInventoriesField(value))
  @Type(() => SyncRetailerInventoryItemDto)
  inventories: SyncRetailerInventoryItemDto[];
}
