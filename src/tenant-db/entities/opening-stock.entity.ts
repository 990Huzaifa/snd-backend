import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Distributor } from './distributor.entity';
import { ProductFlavour, Product, ProductPricing } from './product.entity';
import { User } from './user.entity';

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

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'createdBy' })
    createdBy: User | null;

    @OneToMany(() => OpeningStockItem, (line) => line.OpeningStock)
    items: OpeningStockItem[];

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

    @ManyToOne(() => OpeningStock, (stock) => stock.items, { onDelete: 'CASCADE' })
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
