import { IsEnum } from 'class-validator';
import { LoadSheetStatus } from 'src/tenant-db/entities/loadsheet.entity';

export class UpdateLoadSheetStatusDto {
  @IsEnum(LoadSheetStatus)
  status: LoadSheetStatus;
}
