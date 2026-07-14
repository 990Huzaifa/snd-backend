import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SaleOrder } from "./saleorder.entity";
import { JoinColumn } from "typeorm";
import { Product, ProductFlavour, ProductPricing } from "./product.entity";
import { Retailer } from "./retailer.entity";
import { Distributor } from "./distributor.entity";
import { User } from "./user.entity";


export enum ReturnType {
    RETAILER = 'RETAILER',
    ORDER = 'ORDER',
}

export enum ReturnStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
    COMPLETED = 'COMPLETED',
}

@Entity('sale_returns')
export class SaleReturn {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({unique: true})
    returnNumber: string;

    @Column({type: 'enum', enum: ReturnType})
    returnType: ReturnType;

    @Column()
    returnDate: Date;

    @Column()
    retailerId: string;

    @Column({nullable: true})
    distributorId: string;

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

    @Column({nullable: true})
    salesmanId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'salesmanId' })
    salesman: User;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column({nullable: true})
    orderId: string;

    @ManyToOne(() => SaleOrder, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'orderId' })
    order: SaleOrder;

    @Column({nullable: true})
    note: string;

    @Column({type: 'decimal', precision: 10, scale: 2})
    returnAmount: number;

    @Column({type: 'enum', enum: ReturnStatus})
    returnStatus: ReturnStatus;

    @Column({nullable: true})
    executedBy: string;

    @Column({nullable: true})
    executedDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => SaleReturnItem, (item) => item.saleReturn)
    items: SaleReturnItem[];
}

@Entity('sale_return_items')
export class SaleReturnItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    saleReturnId: string;

    @ManyToOne(() => SaleReturn, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleReturnId' })
    saleReturn: SaleReturn;

    @Column()
    productId: string;

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;

    @Column()
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, { onDelete: 'RESTRICT' })
    @JoinColumn()
    productFlavour: ProductFlavour;

    @Column()
    productPricingId: string;

    @ManyToOne(() => ProductPricing, { onDelete: 'CASCADE' })
    @JoinColumn()
    productPricing: ProductPricing;

    @Column({default: 0})
    orderedQuantity: number;

    @Column({default: 0})
    returnedQuantity: number;

    @Column({type: 'decimal', precision: 10, scale: 2})
    total: number;

    @Column()
    retirnReason: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}   