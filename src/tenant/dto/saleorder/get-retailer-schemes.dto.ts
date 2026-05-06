import { IsDateString, IsUUID } from 'class-validator';

export class GetRetailerSchemesDto {
  @IsUUID()
  retailerId: string;

  @IsDateString()
  orderDate: string;
}
