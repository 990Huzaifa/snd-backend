import { Column, CreateDateColumn, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Distributor } from "./distributor.entity";
import { Product, ProductFlavour, ProductPricing } from "./product.entity";
import { JoinColumn } from "typeorm";
import { ManyToOne } from "typeorm";
import { Entity } from "typeorm";

@Entity('purchase_stocks')
export class PurchaseStock {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    distributorId: string;  

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

    @Column()
    remarks: string;

    @Column()
    purchaseDate: Date;

    @OneToMany(() => PurchaseStockItem, (line) => line.purchaseStock)
    items: PurchaseStockItem[];
    
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('purchase_stock_items')
export class PurchaseStockItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    purchaseStockId: string;

    @ManyToOne(() => PurchaseStock, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchaseStockId' })
    purchaseStock: PurchaseStock;
    
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
