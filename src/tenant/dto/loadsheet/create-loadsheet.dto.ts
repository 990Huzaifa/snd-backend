import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LoadSheetStatus } from 'src/tenant-db/entities/loadsheet.entity';

export class CreateLoadSheetOrderSelectionDto {
  @IsUUID()
  saleOrderId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliverySequence?: number;
}

export class CreateLoadSheetDto {
  @IsUUID()
  distributorId: string;

  @IsUUID()
  riderId: string;

  @IsDateString()
  loadSheetDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleNumber?: string;

  @IsOptional()
  @IsEnum(LoadSheetStatus)
  status?: LoadSheetStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLoadSheetOrderSelectionDto)
  orders: CreateLoadSheetOrderSelectionDto[];
}
