import { DataSource } from 'typeorm';
import * as fs from 'fs';
import { Country } from '../entities/country.entity';
import { State } from '../entities/state.entity';
import { City } from '../entities/city.entity';

export async function geoDataSeeder(dataSource: DataSource) {
    const cityRepo = dataSource.getRepository(City);
    const stateRepo = dataSource.getRepository(State);

    console.log('🌱 Seeding geo data...');
    
    // Read cities JSON file
    // Read JSON files
    // const countriesData = JSON.parse(fs.readFileSync('src/master-db/seed-data/countries.json', 'utf-8'));
    // const statesData = JSON.parse(fs.readFileSync('src/master-db/seed-data/states.json', 'utf-8'));
    const citiesData = JSON.parse(fs.readFileSync('src/master-db/seed-data/cities.json', 'utf-8'));
    
    console.log(`📊 Loaded ${citiesData.length} cities`);

    // Insert countries (batch insert)
    // const countryEntities = countriesData.map((country: any) => countryRepo.create({
    //     name: country.name,
    //     iso_code: country.iso3
    // }));
    // await countryRepo.save(countryEntities);
    // console.log('✅ Countries seeded.');

    // Insert states (batch insert)
    // const stateEntities = statesData.map((state: any) => stateRepo.create({
    //     name: state.name,
    //     code: state.iso2,
    //     country_id: state.country_id
    // }));
    // await stateRepo.save(stateEntities);
    // console.log('✅ States seeded.');

    console.log(`📊 Loaded ${citiesData.length} cities.`);

    const batchSize = 500;  // Adjust batch size based on your server's memory
    let batchCount = 0;

    // Process cities in batches
    for (let i = 0; i < citiesData.length; i += batchSize) {
        // Slice the data to create smaller batches
        const batch = citiesData.slice(i, i + batchSize);
        const cityEntities: City[] = [];

        // Prepare city entities for batch insertion
        for (const city of batch) {
            // Find the corresponding state for the given state_id
            const state = await stateRepo.findOne({ where: { id: city.state_id } });
            if (!state) {
                console.log(`⚠️ State with ID '${city.state_id}' not found for city '${city.name}', skipping.`);
                continue;
            }

            const cityEntity: City = cityRepo.create({
                name: city.name,
                code: city.state_code,
                state_id: state.id, // Reference the state ID
                is_active: true, // Default active
            });

            cityEntities.push(cityEntity);
        }

        // Insert the current batch into the database
        if (cityEntities.length > 0) {
            await cityRepo.save(cityEntities);
            batchCount++;
            console.log(`✅ Batch ${batchCount} of cities seeded.`);
        }

        // Clear the memory before processing the next batch
        cityEntities.length = 0;  // Clear the array
    }

    console.log('🌱 Geo data seeding completed.\n');
}