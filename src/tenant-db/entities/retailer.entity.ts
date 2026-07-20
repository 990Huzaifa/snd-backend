import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Route } from "./route.entity";
import { User } from "./user.entity";
import { SchemeRetailer, SchemeRetailerChannel } from "./scheme.entity";
import { SaleOrder } from "./saleorder.entity";
import { SaleVoucher } from "./sale-voucher.entity";
import { SaleReturn } from "./sale-return.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";

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
    phone: string;

    @Column({nullable: true})
    email: string;

    @Column({nullable: true})
    CNIC: string;

    @Column({nullable: true})
    STRN: string;

    @Column({nullable: true})
    NTN: string;

    @Column()
    address: string;

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

    @OneToMany(() => SaleVoucher, (saleVoucher) => saleVoucher.retailer)
    saleVouchers: SaleVoucher[];

    @OneToMany(() => SaleReturn, (saleReturn) => saleReturn.retailer)
    saleReturns: SaleReturn[];  
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

export enum RetailerVisitStatus {
    ORDER_BOOKED = 'ORDER_BOOKED',
    NO_SALE = 'NO_SALE',
    SHOP_CLOSED = 'SHOP_CLOSED',
    OWNER_ABSENT = 'OWNER_ABSENT',
    STOCK_FULL = 'STOCK_FULL',
    RETURN_BOOKED = 'RETURN_BOOKED',
}

@Entity('retailer_visits')
export class RetailerVisit {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({comment: 'Salesman ID, MERCHANDISER ID, etc.'})
    userId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column()
    routeId: string;

    @ManyToOne(() => Route, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'routeId' })
    route: Route;

    @Column({ type: 'enum', enum: RetailerVisitStatus })
    visitStatus: RetailerVisitStatus;   

    @Column({ nullable: true })
    notes: string;

    @Column('text', { array: true, nullable: true })
    shopImages: string[] | null;

    @Column('text', { array: true, nullable: true })
    shelfImages: string[] | null;

    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('retailer_merchandising')
export class RetailerMerchandising {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column('text', { array: true, nullable: true })
    shelfImages: string[] | null;

    @Column({nullable: true})
    notes: string;
    
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}  

@Entity('retailer_attendences')
export class RetailerAttendence {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({comment: 'Salesman ID, MERCHANDISER ID, etc.'})
    userId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column()
    attendenceDate: Date;

    @Column({nullable: true, type: 'decimal', precision: 10, scale: 8 })
    checkinLatitude: number;

    @Column({nullable: true, type: 'decimal', precision: 10, scale: 8 })
    checkinLongitude: number;

    @CreateDateColumn()
    createdAt: Date;
    
    @UpdateDateColumn()
    updatedAt: Date;
}  

export enum RetailerInventoryType {
    WAREHOUSE = 'WAREHOUSE',
    SHELF = 'SHELF',
}

@Entity('retailer_inventories')
export class RetailerInventory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: RetailerInventoryType })
    type: RetailerInventoryType;

    @Column({ type: 'uuid' })
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column({ type: 'uuid' })
    productId: string;

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({ type: 'uuid' })
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column({ type: 'uuid' })
    uomId: string;

    @ManyToOne(() => Uom, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column()
    quantity: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}