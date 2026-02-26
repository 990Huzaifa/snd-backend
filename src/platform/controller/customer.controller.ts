import { Controller, Post, Body } from '@nestjs/common';
import { CustomerService } from '../services/customer.service';
import { LoginCustomerDto } from '../dto/customer/login-customer.dto';
import { UpdateCustomerDto } from '../dto/customer/update-customer.dto';
import { RegisterCustomerDto } from '../dto/customer/register-customer.dto';

@Controller('platform/customer')
export class CustomerController {
    constructor(private readonly customerService: CustomerService) {}

    // Signup Route
    @Post('signup')
    async signUp(@Body() createCustomerDto: RegisterCustomerDto) {
        return this.customerService.registerCustomer(createCustomerDto);
    }

    // Email Verification Route
    @Post('verify-email')
    async verifyEmail(@Body('code') code: string) {
        return this.customerService.verifyCustomerEmail(code);
    }

    // resend verification email
    @Post('resend-verification-email')
    async resendVerificationEmail(@Body('email') email: string) {
        return this.customerService.resendVerificationEmail(email);
    }

    // Login Route
    @Post('login')
    async login(@Body() loginCustomerDto: LoginCustomerDto) {
        return this.customerService.loginCustomer(loginCustomerDto);
    }

    // Update Route (for customer profile updates)
    @Post('update')
    async update(@Body() updateCustomerDto: UpdateCustomerDto) {
        return this.customerService.updateCustomer(updateCustomerDto);
    }
}
