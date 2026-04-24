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
    salesmen: SalesmanDistributor[];

    @Column({ nullable: true })
    deviceId: string;

    @Column({nullable: true})
    fcmToken: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}

@Entity('salesman_distributors')
export class SalesmanDistributor {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User, (user) => user.salesmen)
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
