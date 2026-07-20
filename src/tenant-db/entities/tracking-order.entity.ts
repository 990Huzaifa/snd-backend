import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Retailer } from "./retailer.entity";
import { User } from "./user.entity";
import { Product, ProductPricing } from "./product.entity";
import { ProductFlavour } from "./product.entity";

@Entity('tracking_orders')
export class TrackingOrder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    orderNumber: string;

    @Column({ type: 'uuid' })
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({nullable: true})
    customerName: string;

    @Column({nullable: true})
    customerPhone: string;

    @Column({default: 0 })
    orderTotal: number;

    @Column({default: 0 })
    taxPercentage: number;

    @Column({default: 0 })
    taxAmount: number;

    @Column({default: 0 })
    discountPercentage: number;

    @Column({default: 0 })
    discountAmount: number;

    @Column({default: 0 })
    totalAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => TrackingOrderItem, (item) => item.trackingOrder)
    items: TrackingOrderItem[];
}

@Entity('tracking_order_items')
export class TrackingOrderItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    trackingOrderId: string;

    @ManyToOne(() => TrackingOrder, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'trackingOrderId' })
    trackingOrder: TrackingOrder;

    @Column({ type: 'uuid' })
    productId: string;

    @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({ type: 'uuid' })
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column({ type: 'uuid' })
    productPricingId: string;

    @ManyToOne(() => ProductPricing, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productPricingId' })
    productPricing: ProductPricing;

    @Column()
    quantity: number;

    @Column({default: 0})
    discountPercentage: number;

    @Column({default: 0})
    discountAmount: number;

    @Column({default: 0})
    totalAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}