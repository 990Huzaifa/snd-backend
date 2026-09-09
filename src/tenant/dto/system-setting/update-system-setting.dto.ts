import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { WeekDay } from 'src/tenant-db/entities/system-setting.entity';

export class UpdateSystemSettingDto {
  @IsOptional()
  @IsNumberString({}, { message: 'defaultShopRadius must be a numeric string' })
  defaultShopRadius?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  workingHoursPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  workingDaysPerWeek?: number;

  /** 24h time, e.g. 18:00 */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'autoCheckoutTime must be in HH:mm (24h) format',
  })
  autoCheckoutTime?: string;

  /** Weekly holiday / off days, e.g. ["FRIDAY"] or ["SATURDAY","SUNDAY"] */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(WeekDay, { each: true })
  weeklyHolidays?: WeekDay[];
}
