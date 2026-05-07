import { Column, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Distributor } from "./distributor.entity";
import { User } from "./user.entity";
import { Retailer } from "./retailer.entity";

export enum PaymentMethod {
    CASH = 'CASH',
    CHEQUE = 'CHEQUE',
    TRANSFER = 'TRANSFER',
    ONLINE = 'ONLINE',
    OTHER = 'OTHER',
}

@Entity({ name: 'sale_vouchers' })
export class SaleVoucher {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    voucherNumber: string;

    @Column()
    retailerId: string;

    @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'retailerId' })
    retailer: Retailer;

    @Column({ type: 'enum', enum: PaymentMethod })
    paymentMethod: PaymentMethod;

    // if payment method is CHEQUE, then add cheque number, cheque date, and bank name
    @Column({ nullable: true })
    chequeNumber: string;

    @Column({ nullable: true })
    chequeDate: Date;

    @Column({ nullable: true })
    bankName: string;

    @Column()
    paymentDate: Date;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    paymentAmount: number;

    @Column({ nullable: true })
    remarks: string;

    @Column({ nullable: true, default: null })
    executedBy: string;

    @Column({ nullable: true })
    executedDate: Date;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'executedBy' })
    executedByUser: User | null;  
    
    @Column({ nullable: true })
    createdBy: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User | null;  

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}