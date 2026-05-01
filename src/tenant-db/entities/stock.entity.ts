import { ProductFlavour, Product, ProductPricing } from "./product.entity";
import { CreateDateColumn, Entity,PrimaryGeneratedColumn, UpdateDateColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Distributor } from "./distributor.entity";


export enum ReferenceType {
    ADJUSTMENT = 'ADJUSTMENT',
    TRANSFER = 'TRANSFER',
    PURCHASE = 'PURCHASE',
    OPENING = 'OPENING',
    LOAD = 'LOAD',
    DELIVERY = 'DELIVERY',
    RETURN = 'RETURN',
    SALE = 'SALE',
}

export enum StockMovementType {
    IN = 'IN',
    OUT = 'OUT',
}

@Entity('stock_movements')
export class StockMovement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    distributorId: string;

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

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

    @Column({
        type: 'enum',
        enum: StockMovementType,
    })
    type: StockMovementType;

    @Column({
        type: 'enum',
        enum: ReferenceType,
    })
    referenceType: ReferenceType;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('stock_balances')
export class StockBalance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    distributorId: string;

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

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