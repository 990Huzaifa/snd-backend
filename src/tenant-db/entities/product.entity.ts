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
import { User } from './user.entity';
import { PurchaseStockItem } from './purchase-stock.entity';
import { OpeningStockItem } from './opening-stock.entity';
import { StockBalance, StockMovement } from './stock.entity';
import { StockTransferItem } from './stock-transfer.entity';

@Entity('product_categories')
export class ProductCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    slug: string;

    @Column({ name: 'created_by', nullable: true })
    createdBy: string;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by' })
    createdByUser: User | null;

    @OneToMany(() => Product, (product) => product.category)
    products: Product[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

@Entity('flavours')
export class Flavour {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @OneToMany(() => ProductFlavour, (productFlavour) => productFlavour.flavour)
    products: ProductFlavour[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}

@Entity({ name: 'uoms' })
export class Uom {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ name: 'is_base', default: false })
    isBase: boolean;

    @OneToMany(() => ProductPricing, (productPricing) => productPricing.uom)
    pricings: ProductPricing[];
}

@Entity('product_brands')
export class ProductBrand {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @OneToMany(() => Product, (product) => product.brand)
    products: Product[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    categoryId: string;

    @ManyToOne(() => ProductCategory, (category) => category.products, { onDelete: 'RESTRICT' })
    @JoinColumn()
    category: ProductCategory;

    @Column({unique: true })
    skuCode: string;

    @Column()
    name: string;

    @Column({nullable: true })
    description: string;

    @Column({nullable: true })
    brandId: string;

    @ManyToOne(() => ProductBrand, (brand) => brand.products, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'brandId' })
    brand: ProductBrand | null;

    @Column({nullable: true })
    image: string | null;

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'createdBy' })
    createdBy: User | null;

    @Column({ default: false })
    isDelete: boolean;

    @OneToMany(() => ProductFlavour, (flavour) => flavour.product)
    flavours: ProductFlavour[];

    @OneToMany(() => ProductPricing, (pricing) => pricing.product)
    pricing: ProductPricing[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;


    @OneToMany(() => PurchaseStockItem, (purchaseStockItem) => purchaseStockItem.product)
    purchaseStockItems: PurchaseStockItem[];

    @OneToMany(() => OpeningStockItem, (openingStockItem) => openingStockItem.product)
    openingStockItems: OpeningStockItem[];

    @OneToMany(() => StockMovement, (stockMovement) => stockMovement.product)
    stockMovements: StockMovement[];

    @OneToMany(() => StockBalance, (stockBalance) => stockBalance.product)
    stockBalances: StockBalance[];

    @OneToMany(() => StockTransferItem, (stockTransferItem) => stockTransferItem.product)
    stockTransferItems: StockTransferItem[];

    @OneToMany(() => ProductPricingJob, (productPricingJob) => productPricingJob.product)
    pricingJobs: ProductPricingJob[];
}

@Entity('product_flavours')
export class ProductFlavour {
    @PrimaryGeneratedColumn()
    id: string;

    @ManyToOne(() => Product, (product) => product.flavours, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;

    @Column()
    productId: string;

    @ManyToOne(() => Flavour, { onDelete: 'RESTRICT' })
    @JoinColumn()
    flavour: Flavour;

    @Column()
    flavourId: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => OpeningStockItem, (openingStockItem) => openingStockItem.productFlavour)
    openingStockItems: OpeningStockItem[];
    @OneToMany(() => StockMovement, (stockMovement) => stockMovement.productFlavour)
    stockMovements: StockMovement[];
    @OneToMany(() => StockBalance, (stockBalance) => stockBalance.productFlavour)
    stockBalances: StockBalance[];
    @OneToMany(() => StockTransferItem, (stockTransferItem) => stockTransferItem.productFlavour)
    stockTransferItems: StockTransferItem[];
}

@Entity('product_pricings')
export class ProductPricing {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.pricing, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.pricings, { onDelete: 'RESTRICT' })
    @JoinColumn()
    uom: Uom;

    @Column()
    tradePrice: string;

    @Column()
    retailPrice: string;

    @Column()
    quantity: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => OpeningStockItem, (openingStockItem) => openingStockItem.productPricing)
    openingStockItems: OpeningStockItem[];
    @OneToMany(() => StockMovement, (stockMovement) => stockMovement.productPricing)
    stockMovements: StockMovement[];
    @OneToMany(() => StockBalance, (stockBalance) => stockBalance.productPricing)
    stockBalances: StockBalance[];
    @OneToMany(() => StockTransferItem, (stockTransferItem) => stockTransferItem.productPricing)
    stockTransferItems: StockTransferItem[];
    @OneToMany(() => ProductPricingJob, (productPricingJob) => productPricingJob.productPricing)
    pricingJobs: ProductPricingJob[];

}

@Entity('product_pricing_jobs')
export class ProductPricingJob {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.pricingJobs, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;
    
    @Column()
    productPricingId: string;

    @ManyToOne(() => ProductPricing, (productPricing) => productPricing.pricingJobs, { onDelete: 'CASCADE' })
    @JoinColumn()
    productPricing: ProductPricing;

    @Column()
    startDate: Date;

    @Column()
    status: 'PENDING' | 'COMPLETED' | 'FAILED';

    @Column()
    tradePrice: string;

    @Column()
    retailPrice: string;

    @Column()
    quantity: number;

    @Column()
    errorMessage: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
