import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';
import { Area } from './area.entity';

@Entity({ name: 'regions' })
@Index(['city_id', 'name'], { unique: true })
export class Region {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /**
     * Logical reference to Master DB cities.id
     * No FK constraint (cross-database relation)
     */
    @Column('uuid')
    city_id: string;

    @Column({ length: 150 })
    name: string;

    @Column({ length: 50, nullable: true })
    code: string;

    @Column({ default: true })
    is_active: boolean;

    @OneToMany(() => Area, (area) => area.region)
    areas: Area[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
