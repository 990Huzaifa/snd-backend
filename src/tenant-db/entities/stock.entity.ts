import { ProductFlavour, Product, ProductPricing, Uom } from "./product.entity";
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

    @Column({ type: 'uuid' })
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.stockMovements, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

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

    @Column({ type: 'uuid' })
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.stockBalances, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column({ default: 0 })
    quantityAvailable: number;

    @Column({ default: 0 })
    quantityOnHand: number;

    @Column({ default: 0 })
    quantityReserved: number;

    @Column({ default: 0 })
    quantityDamaged: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}