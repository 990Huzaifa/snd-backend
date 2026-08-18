import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Distributor } from "./distributor.entity";
import { User } from "./user.entity";
import { Retailer } from "./retailer.entity";
import { Route } from "./route.entity";
import { Scheme } from "./scheme.entity";
import { SchemeSlab } from "./scheme.entity";
import { Product } from "./product.entity";
import { ProductFlavour } from "./product.entity";
import { ProductPricing } from "./product.entity";



@Entity({ name: 'spg_orders' })
export class SpgOrder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    orderNumber: string;

    @Column()
    spgId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'spgId' })
    spg: User;

    @Column()
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column({nullable: true})
    notes: string;

    @Column()
    orderDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => SpgOrderItem, (item) => item.spgOrder)
    items: SpgOrderItem[];
}

@Entity({ name: 'spg_order_items' })
export class SpgOrderItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    spgOrderId: string;

    @ManyToOne(() => SpgOrder, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'spgOrderId' })
    spgOrder: SpgOrder;

    @Column()
    productId: string;

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, { onDelete: 'RESTRICT' })
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