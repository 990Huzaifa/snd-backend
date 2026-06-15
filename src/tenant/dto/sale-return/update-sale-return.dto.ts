import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateSaleReturnDto } from './create-sale-return.dto';

/** Status changes must use the dedicated status endpoint (stock posting). */
export class UpdateSaleReturnDto extends PartialType(
  OmitType(CreateSaleReturnDto, ['returnStatus'] as const),
) {}
