import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Country } from "./country.entity";
import { City } from "./city.entity";

@Entity({name: 'states'})
export class State{
    @PrimaryGeneratedColumn('uuid')
    id: string;


    @ManyToOne(() => Country, (country) => country.states, {
        onDelete: 'CASCADE',   // if country deleted, states deleted
    })
    @JoinColumn({ name: 'country_id' })
    country: Country;    

    @Column({ unique: true })
    name: string; 

    @Column()
    code: string; 

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => City, (city) => city.state)
    cities: City[]; 
}