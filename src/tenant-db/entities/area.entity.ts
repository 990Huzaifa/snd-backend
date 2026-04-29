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
import { Region } from './region.entity';
import { Distributor } from './distributor.entity';
import { Route } from './route.entity';

@Entity({ name: 'areas' })
export class Area {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Region, (region) => region.areas, {
        onDelete: 'CASCADE',
    })

    @JoinColumn({ name: 'regionId' })
    region: Region;

    @Column()
    name: string;

    @Column()
    code: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => Distributor, (distributor) => distributor.area)
    distributors: Distributor[];

    @OneToMany(() => Route, (route) => route.area)
    routes: Route[];
}
