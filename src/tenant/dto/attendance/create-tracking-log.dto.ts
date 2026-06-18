import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  ValidateNested,
} from 'class-validator';

export class CreateTrackingLogItemDto {
  @Type(() => Number)
  @IsNumber()
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  longitude: number;
}

export class CreateTrackingLogDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTrackingLogItemDto)
  logs: CreateTrackingLogItemDto[];
}
