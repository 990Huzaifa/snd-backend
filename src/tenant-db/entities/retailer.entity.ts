import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Route } from "./route.entity";
import { User } from "./user.entity";
import { SchemeRetailer, SchemeRetailerChannel } from "./scheme.entity";
import { SaleOrder } from "./saleorder.entity";

@Entity('retailer_categories')
export class RetailerCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => Retailer, (retailer) => retailer.retailerCategory)
    retailers: Retailer[];
}

@Entity('retailer_channels')
export class RetailerChannel {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => Retailer, (retailer) => retailer.retailerChannel)
    retailers: Retailer[];

    @OneToMany(() => SchemeRetailerChannel, (schemeRetailerChannel) => schemeRetailerChannel.retailerChannel, { onDelete: 'CASCADE' })
    schemeRetailerChannels: SchemeRetailerChannel[];
}

export enum RetailerClass {
    A = 'A',
    B = 'B',
    C = 'C',
}

export enum Status {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    PENDING = 'PENDING',
}

export enum RefType {
    SALE = 'SALE',
    RETURN = 'RETURN',
    PAYMENT = 'PAYMENT',
    OPENING_BALANCE = 'OPENING_BALANCE',
}

@Entity('retailers')
export class Retailer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    shopName: string;

    @Column()
    ownerName: string;

    @Column({nullable: true})
    image: string;

    @Column({nullable: true})
    Phone: string;

    @Column({nullable: true})
    Email: string;

    @Column({nullable: true})
    CNIC: string;

    @Column({nullable: true})
    STRN: string;

    @Column({nullable: true})
    NTN: string;

    @Column()
    Address: string;

    @Column()
    latitude: string;

    @Column()
    longitude: string;

    @Column()
    maxRadius: string;

    @Column()
    creditLimit: string;

    @Column({ type: 'enum', enum: RetailerClass })
    class: RetailerClass;

    @Column({ type: 'enum', enum: Status })
    status: Status;

    @Column()
    createdBy: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User;

    @Column({nullable: true})
    approvedBy: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'approvedBy' })
    approvedByUser: User;

    @Column()
    routeId: string;

    @ManyToOne(() => Route, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'routeId' })
    route: Route;
    
    @Column()
    retailerCategoryId: string;

    @ManyToOne(() => RetailerCategory, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerCategoryId' })
    retailerCategory: RetailerCategory; 

    @Column()
    retailerChannelId: string;

    @ManyToOne(() => RetailerChannel, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerChannelId' })
    retailerChannel: RetailerChannel;
    
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => RetailerLedger, (retailerLedger) => retailerLedger.retailer)
    retailerLedgers: RetailerLedger[];

    @OneToMany(() => SchemeRetailer, (schemeRetailer) => schemeRetailer.retailer)
    schemes: SchemeRetailer[];

    @OneToMany(() => SaleOrder, (saleOrder) => saleOrder.retailer)
    saleOrders: SaleOrder[];
}   

@Entity('retailer_ledgers')
export class RetailerLedger {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column({ type: 'enum', enum: RefType })
    refType: RefType;

    @Column({nullable: true})
    credit: string;

    @Column({nullable: true})
    debit: string;

    @Column({ default: '0.00' })
    currentBalance: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;    
}