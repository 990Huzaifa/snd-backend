import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from 'src/master-db/entities/customer.entity';

@Injectable()
export class CustomerService {
    constructor(
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
    ) { }


    async getCustomers(page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const customers = await this.customerRepo.find({
            skip: skip,
            take: limit,
            select: ['id', 'email', 'fullName', 'isActive', 'createdAt', 'updatedAt'],
            order: { createdAt: 'ASC' },
        });
        return {
            data: customers,
            meta: {
                page: page,
                limit: limit,
            },
        };
    }

    async showCustomer(id: string) {
        const customer = await this.customerRepo.findOne({ where: { id: id } });

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }
        delete customer.passwordHash;
        return customer;
    }


}
