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
import { State } from './state.entity';
import { Region } from './region.entity';

@Entity({ name: 'cities' })
export class City {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => State, (state) => state.cities, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'state_id' })
    state: State;

    @Column()
    name: string;

    @Column()
    code: string;

    // Sales territory link
    @OneToMany(() => Region, (region) => region.city)
    regions: Region[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
