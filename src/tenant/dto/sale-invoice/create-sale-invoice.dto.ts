import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateSaleInvoiceItemDto } from './create-sale-invoice-item.dto';

export class CreateSaleInvoiceDto {
  @IsUUID()
  distributorId: string;

  @IsUUID()
  salesmanId: string;

  @IsUUID()
  retailerId: string;

  @IsUUID()
  routeId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  invoiceTotal: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalDiscountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalTaxAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subTotalAmount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsUUID()
  schemeId?: string;

  @IsOptional()
  @IsUUID()
  schemeSlabId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsDateString()
  invoiceDate: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleInvoiceItemDto)
  items: CreateSaleInvoiceItemDto[];
}
