import { IsDateString, IsUUID } from 'class-validator';

export class SaleOrderSummaryReportDto {
  @IsUUID()
  salesmanId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
