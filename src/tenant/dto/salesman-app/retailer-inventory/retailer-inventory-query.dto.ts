import { IsOptional, IsUUID } from 'class-validator';

export class RetailerInventoryQueryDto {
  @IsOptional()
  @IsUUID()
  retailerId?: string;
}
