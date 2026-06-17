import { Type, Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DeliveryStatus } from 'src/tenant-db/entities/loadsheet.entity';
import { UpdateOrderDeliveryItemDto } from './update-order-delivery-item.dto';

export class UpdateOrderDeliveryDto {
  @IsEnum(DeliveryStatus)
  deliveryStatus: DeliveryStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return JSON.parse(value) as unknown;
    }
    return value;
  })
  @Type(() => UpdateOrderDeliveryItemDto)
  items: UpdateOrderDeliveryItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @IsDateString()
  deliveredDate: string;
}
