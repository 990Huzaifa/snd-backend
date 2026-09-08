import { IsDateString, IsUUID } from 'class-validator';

export class SalesmanTrackingReportDto {
  @IsUUID()
  salesmanId: string;

  @IsDateString()
  date: string;
}
