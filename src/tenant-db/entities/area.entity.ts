import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Region } from './region.entity';

@Entity({ name: 'areas' })
export class Area {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Region, (region) => region.areas, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'region_id' })
    region: Region;

    @Column()
    name: string;

    @Column()
    code: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
