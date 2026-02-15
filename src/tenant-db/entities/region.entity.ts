import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { City } from './city.entity';
import { Area } from './area.entity';

@Entity({ name: 'regions' })
export class Region {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => City, (city) => city.regions, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'city_id' })
    city: City;

    @Column()
    name: string;

    @Column()
    code: string;

    @OneToMany(() => Area, (area) => area.region)
    areas: Area[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
