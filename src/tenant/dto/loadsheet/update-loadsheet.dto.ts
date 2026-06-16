import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LoadSheetStatus } from 'src/tenant-db/entities/loadsheet.entity';

export class UpdateLoadSheetDto {
  @IsOptional()
  @IsUUID()
  riderId?: string;

  @IsOptional()
  @IsDateString()
  loadSheetDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleNumber?: string;

  @IsOptional()
  @IsEnum(LoadSheetStatus)
  status?: LoadSheetStatus;
}
