import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsUUID, Min } from 'class-validator';

export class GetRetailerSchemesDto {
  @IsUUID()
  retailerId: string;

  @IsDateString()
  orderDate: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderTotal: number;
}