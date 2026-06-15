import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ReturnStatus,
  ReturnType,
} from 'src/tenant-db/entities/sale-return.entity';
import { CreateSaleReturnItemDto } from './create-sale-return-item.dto';

export class CreateSaleReturnDto {
  @IsEnum(ReturnType)
  returnType: ReturnType;

  @IsDateString()
  returnDate: string;

  @IsUUID()
  retailerId: string;

  @ValidateIf((dto: CreateSaleReturnDto) => dto.returnType === ReturnType.ORDER)
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returnAmount: number;

  /** Omit or `PENDING` for draft; `APPROVED` creates the return and posts stock in one step. */
  @IsOptional()
  @IsIn([ReturnStatus.PENDING, ReturnStatus.APPROVED])
  returnStatus?: ReturnStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnItemDto)
  items: CreateSaleReturnItemDto[];
}
