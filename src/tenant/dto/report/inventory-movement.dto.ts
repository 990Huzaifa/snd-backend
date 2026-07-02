import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class InventoryMovementDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
