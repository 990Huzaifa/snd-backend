import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Distributor } from "./distributor.entity";
import { ProductFlavour, Product, ProductPricing } from "./product.entity";
import { JoinColumn } from "typeorm";
import { ManyToOne } from "typeorm";
import { Entity } from "typeorm";

@Entity('stock_transfers')
export class StockTransfer {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column()
    fromDistributorId: string;  

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'fromDistributorId' })
    fromDistributor: Distributor;

    @Column()
    toDistributorId: string;  

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'toDistributorId' })
    toDistributor: Distributor;

    @Column()
    remarks: string;

    @Column()
    transferDate: Date;
    
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('stock_transfer_items')
export class StockTransferItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    StockTransferId: string;

    @ManyToOne(() => StockTransfer, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'StockTransferId' })
    StockTransfer: StockTransfer;
    
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
