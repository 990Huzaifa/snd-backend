import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class BulkTransferRetailerRouteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  retailerIds: string[];

  @IsUUID()
  destinationRouteId: string;

  @IsString()
  @MinLength(1)
  reason: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  /** If true, transfer runs immediately in background (ignores effectiveDate for scheduling). */
  @IsOptional()
  @IsBoolean()
  immediate?: boolean;

  /** Required when immediate is not true. ISO date/datetime. Past/today runs ASAP; future waits for cron. */
  @ValidateIf((dto: BulkTransferRetailerRouteDto) => dto.immediate !== true)
  @IsDateString()
  effectiveDate?: string;
}
