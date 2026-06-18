import { IsEnum } from 'class-validator';
import { InvoiceStatus } from 'src/tenant-db/entities/sale-invoice.entity';

export class UpdateSaleInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  invoiceStatus: InvoiceStatus;
}
