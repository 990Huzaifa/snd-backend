import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { City } from 'src/master-db/entities/city.entity';
import { Country } from 'src/master-db/entities/country.entity';
import { State } from 'src/master-db/entities/state.entity';
import { DataSource, Like, Repository } from 'typeorm';

@Injectable()
export class UtilityService {
    constructor(
        @InjectRepository(Country)
        private readonly countryRepo: Repository<Country>,
        @InjectRepository(State)
        private readonly stateRepo: Repository<State>,
        @InjectRepository(City)
        private readonly cityRepo: Repository<City>,
    ) {}

    // here we make public apis like countrys, states, cities etc

    async getCountries() {
        // ideally this should come from a database or external API, but for simplicity, we'll hardcode it here
        const countries = await this.countryRepo.find();
        return countries;
    }

    async getStates(countryId: any, name: string) {
        // this should ideally come from a database or external API, but for simplicity, we'll hardcode it here
        const states = await this.stateRepo.find({ 
            where: { country: { id: countryId } ,
                name: name ? Like(`%${name}%`) : undefined
            }, 
            order: { name: 'ASC' }
        });
        return states;
    }

    async getCities(stateId: any, name: string) {
        // this should ideally come from a database or external API, but for simplicity, we'll hardcode it here
        const cities = await this.cityRepo.find({ 
            where: { 
                state: { id: stateId },
                name: name ? Like(`%${name}%`) : undefined
            }, 
            order: { name: 'ASC' }
        });
        return cities;
    }
}