import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { Notification } from './notification.entity';
import { Distributor } from './distributor.entity';
import { Attendence } from './attendence.entity';
import { SaleOrder } from './saleorder.entity';
import { SaleVoucher } from './sale-voucher.entity';

export enum UserType {
    ADMIN = 'ADMIN',
    SALESMAN = 'SALESMAN',
    RIDER = 'RIDER',
    MERCHANDISER = 'MERCHANDISER',
    SPG = 'SPG',
    USER = 'USER',
    OTHER = 'OTHER',
}

@Entity('designations')
export class Designation {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    slug: string;

    @Column({nullable: true})
    description: string;

    @Column({ default: true })
    isActive: boolean;

    @OneToMany(() => User, (user) => user.designation)
    users: User[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}


@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({unique: true})
    code: string;

    @Column({type: 'enum', enum: UserType, default: UserType.USER})
    type: UserType;

    @Column()
    name: string;

    @Column({ unique: true })
    email: string;

    @Column({nullable: true})
    password: string;

    @Column({nullable: true})
    phone: string;

    @Column({nullable: true})
    cnic: string;

    @Column({nullable: true})
    avatar: string;

    @Column({nullable: true})
    address: string;

    @ManyToOne(() => Designation, (designation) => designation.users)
    @JoinColumn({ name: 'designationId' })
    designation: Designation;

    @Column({ nullable: true })
    designationId: number;

    @Column({nullable: true})
    joiningDate: Date;

    @Column({nullable: true})
    leavingDate: Date;

    // geo cols

    @Column({nullable: true})
    countryId: string;

    @Column({nullable: true})
    stateId: string;

    @Column({nullable: true})
    cityId: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isDeleted: boolean;

    // ✅ One User = One Role
    @ManyToOne(() => Role, (role) => role.users, {
        nullable: false,
        // eager: true, // auto load role
    })
    @JoinColumn({ name: 'roleId' })
    role: Role;

    @Column({ nullable: true })
    roleId: string;

    @OneToMany(() => Notification, (notification) => notification.user)
    notifications: Notification[];

    @OneToMany(() => SalesmanDistributor, (salesman) => salesman.user)
    assignedDistributors: SalesmanDistributor[];

    @Column({ nullable: true })
    deviceId: string;

    @Column({nullable: true})
    fcmToken: string;

    @Column({ nullable: true })
    locationTitle: string;

    @Column({ nullable: true })
    latitude: string;

    @Column({ nullable: true })
    longitude: string;

    @Column({ nullable: true })
    maxRadius: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => Attendence, (attendence) => attendence.user)
    attendences: Attendence[];

    @OneToMany(() => SaleOrder, (saleOrder) => saleOrder.salesman)
    saleOrders: SaleOrder[];

    @OneToMany(() => SaleVoucher, (saleVoucher) => saleVoucher.executedByUser)
    executedSaleVouchers: SaleVoucher[];

    @OneToMany(() => SaleVoucher, (saleVoucher) => saleVoucher.createdByUser)
    createdSaleVouchers: SaleVoucher[];

    @OneToMany(() => SaleOrder, (saleOrder) => saleOrder.executedByUser)
    executedSaleOrders: SaleOrder[];
}

@Entity('salesman_distributors')
export class SalesmanDistributor {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User, (user) => user.assignedDistributors)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ nullable: true })
    userId: string;

    @ManyToOne(() => Distributor, (distributor) => distributor.distributorUsers)
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

    @Column({ nullable: true })
    distributorId: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}
