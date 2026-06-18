import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Distributor } from "./distributor.entity";
import { User } from "./user.entity";
import { Retailer } from "./retailer.entity";
import { Product, ProductFlavour, ProductPricing } from "./product.entity";
import { Scheme, SchemeSlab } from "./scheme.entity";
import { Route } from "./route.entity";
import { SaleOrder } from "./saleorder.entity";


export enum InvoiceStatus {
    UNPAID = 'UNPAID',
    PAID = 'PAID',
}

@Entity({ name: 'sale_invoices' })
export class SaleInvoice {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    invoiceNumber: string;

    @Column()
    distributorId: string;

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

    @Column()
    salesmanId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'salesmanId' })
    salesman: User;

    @Column()
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column()
    routeId: string;

    @ManyToOne(() => Route, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'routeId' })
    route: Route;

    @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.UNPAID })
    invoiceStatus: InvoiceStatus;

    @Column({ nullable: true, unique: true })
    saleOrderId: string | null;

    @ManyToOne(() => SaleOrder, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'saleOrderId' })
    saleOrder: SaleOrder | null;

    @Column()
    invoiceTotal: number;

    @Column({ default: 0 })
    taxPercentage: number;

    @Column({ default: 0 })
    taxAmount: number;

    @Column({ default: 0 })
    discountPercentage: number;

    @Column({ default: 0 })
    discountAmount: number;

    @Column({ default: 0 })
    totalDiscountAmount: number;

    @Column({ default: 0 })
    totalTaxAmount: number;

    @Column({ default: 0 })
    subTotalAmount: number;

    @Column({ default: 0 })
    totalAmount: number;

    @Column({nullable: true})
    schemeId: string;

    @ManyToOne(() => Scheme, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'schemeId' })
    scheme: Scheme;

    @Column({nullable: true})
    schemeSlabId: string;

    @ManyToOne(() => SchemeSlab, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'schemeSlabId' })
    schemeSlab: SchemeSlab;

    @Column({nullable: true})
    notes: string;
    
    @Column({ nullable: true, default: null })
    executedBy: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'executedBy' })
    executedByUser: User | null;   

    @Column()
    invoiceDate: Date;

    @Column({ nullable: true })
    executedDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => SaleInvoiceItem, (item) => item.saleInvoice)
    items: SaleInvoiceItem[];
}

@Entity({ name: 'sale_invoice_items' })
export class SaleInvoiceItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    saleInvoiceId: string;

    @ManyToOne(() => SaleInvoice, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleInvoiceId' })
    saleInvoice: SaleInvoice;

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

    @Column({ nullable: true })
    schemeId: string | null;

    @ManyToOne(() => Scheme, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'schemeId' })
    scheme: Scheme;

    @Column({ nullable: true })
    slabId: string;

    @ManyToOne(() => SchemeSlab, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'slabId' })
    slab: SchemeSlab;

    @Column({default: 0})
    freeQuantity: number;

    @Column()
    quantity: number;

    @Column({default: 0})
    discountPercentage: number;

    @Column({default: 0})
    discountAmount: number;

    @Column({default: 0})
    taxPercentage: number;  

    @Column({default: 0})
    taxAmount: number;

    @Column({default: 0})
    subTotalAmount: number;    

    @Column({default: 0})
    totalAmount: number;    

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}