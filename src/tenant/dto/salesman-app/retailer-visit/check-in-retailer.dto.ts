import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CheckInRetailerItemDto {
  @IsUUID()
  retailerId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  checkInLatitude: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  checkInLongitude: number;
}

function parseCheckInsField(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { checkIns?: unknown }).checkIns)
    ) {
      return (parsed as { checkIns: unknown[] }).checkIns;
    }
    return parsed;
  }
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { checkIns?: unknown }).checkIns)
  ) {
    return (value as { checkIns: unknown[] }).checkIns;
  }
  return value;
}

export class BulkCheckInRetailerDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Transform(({ value }) => parseCheckInsField(value))
  @Type(() => CheckInRetailerItemDto)
  checkIns: CheckInRetailerItemDto[];
}
