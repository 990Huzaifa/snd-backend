import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class CreateTrackingLogItemDto {
  @Type(() => Number)
  @IsNumber()
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  longitude: number;

  @IsString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/,
    {
      message:
        'logTime must be a datetime like 2026-07-10T09:00:00',
    },
  )
  logTime: string;
}

export class CreateTrackingLogDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTrackingLogItemDto)
  logs: CreateTrackingLogItemDto[];
}
