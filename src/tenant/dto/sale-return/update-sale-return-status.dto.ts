import { IsEnum } from 'class-validator';
import { ReturnStatus } from 'src/tenant-db/entities/sale-return.entity';

export class UpdateSaleReturnStatusDto {
  @IsEnum(ReturnStatus)
  returnStatus: ReturnStatus;
}
