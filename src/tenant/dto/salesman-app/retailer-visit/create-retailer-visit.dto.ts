import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RetailerVisitStatus } from 'src/tenant-db/entities/retailer.entity';

export class CreateRetailerVisitItemDto {
  @IsUUID()
  retailerId: string;

  @IsEnum(RetailerVisitStatus)
  visitStatus: RetailerVisitStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

function parseVisitsField(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { visits?: unknown }).visits)
    ) {
      return (parsed as { visits: unknown[] }).visits;
    }
    return parsed;
  }
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { visits?: unknown }).visits)
  ) {
    return (value as { visits: unknown[] }).visits;
  }
  return value;
}

export class BulkCreateRetailerVisitDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Transform(({ value }) => parseVisitsField(value))
  @Type(() => CreateRetailerVisitItemDto)
  visits: CreateRetailerVisitItemDto[];
}
