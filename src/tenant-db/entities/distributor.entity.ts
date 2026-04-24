import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { SalesmanDistributor } from './user.entity';

@Entity('distributors')
export class Distributor {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    code: string;

    @Column()
    email: string;

    @Column()
    phone: string;

    @Column()
    address: string;

    @Column()
    city: string;

    @Column()
    state: string;

    @Column()
    country: string;

    @Column()
    postalCode: string;

    @Column()
    locationTitle: string;

    @Column()
    latitude: number;

    @Column()
    longitude: number;

    @Column()
    maxRadius: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isDeleted: boolean;

    @OneToMany(() => SalesmanDistributor, (salesmanDistributor) => salesmanDistributor.distributor)
    distributorUsers: SalesmanDistributor[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}