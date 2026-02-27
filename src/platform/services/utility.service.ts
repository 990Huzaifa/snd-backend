import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Country } from 'src/master-db/entities/country.entity';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class UtilityService {
    constructor(
        @InjectRepository(Country)
        private readonly countryRepo: Repository<Country>,
    ) {}

    // here we make public apis like countrys, states, cities etc

    async getCountries() {
        // ideally this should come from a database or external API, but for simplicity, we'll hardcode it here
        const countries = await this.countryRepo.find();
        return countries;
    }
}