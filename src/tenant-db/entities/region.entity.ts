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
@Index(['city', 'name'], { unique: true })
export class Region {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /**
     * Logical reference to Master DB city
     * No FK constraint (cross-database relation)
     */
    @Column()
    city: string;

    @Column({ length: 150 })
    name: string;

    @Column({ length: 50, nullable: true })
    code: string;

    @Column({ default: true })
    isActive: boolean;

    @OneToMany(() => Area, (area) => area.region)
    areas: Area[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
