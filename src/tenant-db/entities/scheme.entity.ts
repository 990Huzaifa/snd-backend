import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Retailer, RetailerChannel } from "./retailer.entity";
import { Product, ProductCategory } from "./product.entity";


export enum SchemeType {
    PIECE_BASED = 'PIECE_BASED',
    AMOUNT_BASED = 'AMOUNT_BASED',
}

export enum BenefitType {
    DISCOUNT_PERCENTAGE = 'DISCOUNT_PERCENTAGE',
    DISCOUNT_AMOUNT = 'DISCOUNT_AMOUNT',
    FREE_PRODUCT = 'FREE_PRODUCT',
}

@Entity('schemes')
export class Scheme {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    schemeType: SchemeType;

    @Column()
    benefitType: BenefitType;

    @Column()
    startDate: Date;

    @Column()
    endDate: Date;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isDeleted: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => SchemeSlab, (schemeSlab) => schemeSlab.scheme, { onDelete: 'CASCADE' })
    slabs: SchemeSlab[];

    @OneToMany(() => SchemeRetailer, (schemeRetailer) => schemeRetailer.scheme, { onDelete: 'CASCADE' })
    retailers: SchemeRetailer[];

    @OneToMany(() => SchemeProduct, (schemeProduct) => schemeProduct.scheme, { onDelete: 'CASCADE' })
    products: SchemeProduct[];

    @OneToMany(() => SchemeProductCategory, (schemeProductCategory) => schemeProductCategory.scheme, { onDelete: 'CASCADE' })
    productCategories: SchemeProductCategory[];

    @OneToMany(() => SchemeRetailerChannel, (schemeRetailerChannel) => schemeRetailerChannel.scheme, { onDelete: 'CASCADE' })
    retailerChannels: SchemeRetailerChannel[];
}

@Entity('scheme_slabs')
export class SchemeSlab {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Scheme, (scheme) => scheme.slabs, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'schemeId' })
    scheme: Scheme;

    @Column()
    minQuantity: number;

    @Column()
    maxQuantity: number;

    @Column()
    benefitValue: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
    
}




@Entity('scheme_retailers')
export class SchemeRetailer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Scheme, (scheme) => scheme.retailers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'schemeId' })
    scheme: Scheme;
    
    @ManyToOne(() => Retailer, (retailer) => retailer.schemes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('scheme_retailer_channels')
export class SchemeRetailerChannel {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @ManyToOne(() => Scheme, (scheme) => scheme.retailerChannels, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'schemeId' })
    scheme: Scheme;

    @ManyToOne(() => RetailerChannel, (retailerChannel) => retailerChannel.schemeRetailerChannels, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'retailerChannelId' })
    retailerChannel: RetailerChannel;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('scheme_products')
export class SchemeProduct {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Scheme, (scheme) => scheme.products, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'schemeId' })
    scheme: Scheme;

    @ManyToOne(() => Product, (product) => product.schemes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
    
}

@Entity('scheme_product_categories')
export class SchemeProductCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Scheme, (scheme) => scheme.productCategories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'schemeId' })
    scheme: Scheme;
    
    @ManyToOne(() => ProductCategory, (productCategory) => productCategory.schemeProductCategories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productCategoryId' })
    productCategory: ProductCategory;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}