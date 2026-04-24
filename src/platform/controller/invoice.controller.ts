import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { InvoiceService } from '../services/invoice.service';

@Controller('platform/invoice')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get('/')
  async getInvoices(@Query('page') page: number = 1, @Query('limit') limit: number = 10, @Req() req: any) {
    return this.invoiceService.getInvoices(page, limit, req.user);
  }

  @Get('/:id')
  async getInvoiceById(@Param('id') id: number, @Req() req: any) {
    return this.invoiceService.getInvoiceById(id, req.user);
  }
}
