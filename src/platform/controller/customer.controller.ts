import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { CustomerService } from '../services/customer.service';

@Controller('platform/customer')
export class CustomerController {
    constructor(private readonly customerService: CustomerService) {}

    @Get('/')
    async getCustomers(@Query('page') page: number, @Query('limit') limit: number) {
        return this.customerService.getCustomers(page, limit);
    }

    @Get('/:id')
    async showCustomer(@Param('id') id: string) {
        return this.customerService.showCustomer(id);
    }
}
