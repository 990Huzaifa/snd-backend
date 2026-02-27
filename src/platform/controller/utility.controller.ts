import { Controller, Post, Body, Get } from '@nestjs/common';
import { UtilityService } from '../services/utility.service';
@Controller('platform/utility')
export class UtilityController {
    constructor(private readonly UtilityService: UtilityService) {}
    

    // here we can add endpoints for utility functions like getCountries, getStates, getCities etc

    @Get('countries')
    async getCountries() {
        return this.UtilityService.getCountries();
    }
}