import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { UtilityService } from '../services/utility.service';
@Controller('utility')
export class UtilityController {
    constructor(private readonly UtilityService: UtilityService) {}
    

    // here we can add endpoints for utility functions like getCountries, getStates, getCities etc

    @Get('countries')
    async getCountries() {
        return this.UtilityService.getCountries();
    }

    @Get('states/:countryId')
    async getStates(@Param('countryId') countryId: any, @Query('name') name: string) {
        return this.UtilityService.getStates(countryId, name);
    }

    @Get('cities/:stateId')
    async getCities(@Param('stateId') stateId: any, @Query('name') name: string) {
        return this.UtilityService.getCities(stateId, name);
    }
}