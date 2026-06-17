import { Column, PrimaryGeneratedColumn, Entity, ManyToOne, JoinColumn, UpdateDateColumn, CreateDateColumn, OneToMany } from "typeorm";
import { Distributor } from "./distributor.entity";
import { User } from "./user.entity";
import { Product, ProductFlavour, ProductPricing } from "./product.entity";
import { SaleOrder, SaleOrderItem } from "./saleorder.entity";
import { Retailer } from "./retailer.entity";

export enum LoadSheetStatus {
    DRAFT = 'DRAFT',
    ASSIGNED = 'ASSIGNED',
    DISPATCHED = 'DISPATCHED',
    INPROGRESS = 'INPROGRESS',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

export enum DeliveryStatus {
    PENDING = 'PENDING',
    PARTIAL = 'PARTIAL',
    DELIVERED = 'DELIVERED',
    NOT_DELIVERED = 'NOT_DELIVERED',
    CANCELLED = 'CANCELLED',
}

@Entity('load_sheets')
export class LoadSheet {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({unique: true})
    loadSheetNumber: string;

    @Column()
    loadSheetDate: Date;

    @Column()
    distributorId: string;

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

    @Column()
    riderId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'riderId' })
    rider: User;

    @Column({nullable: true})
    vehicleNumber: string;

    @Column({type: 'enum', enum: LoadSheetStatus, default: LoadSheetStatus.DRAFT})
    status: LoadSheetStatus;

    @Column({nullable: true})
    dispatchDate: Date;

    @Column({nullable: true})
    completedDate: Date;

    @Column({nullable: true})
    createdBy: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => LoadSheetItem, (loadSheetItem) => loadSheetItem.loadSheet)
    loadSheetItems: LoadSheetItem[];

    @OneToMany(() => LoadSheetOrder, (loadSheetOrder) => loadSheetOrder.loadSheet)
    loadSheetOrders: LoadSheetOrder[];
}

@Entity('load_sheet_items')
export class LoadSheetItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    loadSheetId: string;

    @ManyToOne(() => LoadSheet, (loadSheet) => loadSheet.loadSheetItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'loadSheetId' })
    loadSheet: LoadSheet;

    @Column()
    productId: string;

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    productFlavourId: string;
    
    @ManyToOne(() => ProductFlavour, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column()
    productPricingId: string;
    
    @ManyToOne(() => ProductPricing, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productPricingId' })
    productPricing: ProductPricing;

    @Column()
    quantity: number;   
    
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}


@Entity('load_sheet_orders')
export class LoadSheetOrder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    loadSheetId: string;

    @ManyToOne(() => LoadSheet, (loadSheet) => loadSheet.loadSheetOrders, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'loadSheetId' })
    loadSheet: LoadSheet;

    @Column()
    saleOrderId: string;

    @ManyToOne(() => SaleOrder, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleOrderId' })
    saleOrder: SaleOrder;

    @Column()
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column()
    salesmanId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'salesmanId' })
    salesman: User;

    @Column({type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING})
    deliveryStatus: DeliveryStatus;

    @Column({default: 1})
    deliverySequence: number;

    @Column({nullable: true})
    customerSignature: string;

    @Column({nullable: true})
    deliveryProof: string;

    @Column({nullable: true})
    remarks: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => LoadSheetOrderItem, (loadSheetOrderItem) => loadSheetOrderItem.loadSheetOrder)
    loadSheetOrderItems: LoadSheetOrderItem[];
}

@Entity('load_sheet_order_items')
export class LoadSheetOrderItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    loadSheetOrderId: string;

    @ManyToOne(() => LoadSheetOrder, (loadSheetOrder) => loadSheetOrder.loadSheetOrderItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'loadSheetOrderId' })
    loadSheetOrder: LoadSheetOrder;

    @Column()
    saleOrderItemId: string;

    @ManyToOne(() => SaleOrderItem, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleOrderItemId' })
    saleOrderItem: SaleOrderItem;

    @Column()
    productId: string;

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;
    
    @Column()
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column()
    productPricingId: string;
    
    @ManyToOne(() => ProductPricing, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productPricingId' })
    productPricing: ProductPricing;

    @Column()
    orderedQuantity: number;

    @Column({default: 0})
    deliveredQuantity: number;
    
    @Column({default: 0})
    returnedQuantity: number;

    @Column({default: 0})
    shortQuantity: number;

    @Column({type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING})
    status: DeliveryStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}   