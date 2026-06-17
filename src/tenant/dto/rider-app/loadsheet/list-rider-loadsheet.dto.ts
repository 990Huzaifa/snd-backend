import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { LoadSheetStatus } from 'src/tenant-db/entities/loadsheet.entity';

export class ListRiderLoadsheetDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(LoadSheetStatus)
  status?: LoadSheetStatus;
}
