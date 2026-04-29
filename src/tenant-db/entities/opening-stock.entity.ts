import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Distributor } from "./distributor.entity";
import { ProductFlavour, Product, ProductPricing } from "./product.entity";
import { JoinColumn } from "typeorm";
import { ManyToOne } from "typeorm";
import { Entity } from "typeorm";

@Entity('opening_stocks')
export class OpeningStock {
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
    Date: Date;
    
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('opening_stock_items')
export class OpeningStockItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    OpeningStockId: string;

    @ManyToOne(() => OpeningStock, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'OpeningStockId' })
    OpeningStock: OpeningStock;
    
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
