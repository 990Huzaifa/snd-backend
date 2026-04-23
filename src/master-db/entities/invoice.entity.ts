import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Tenant } from "./tenant.entity";
import { Subscription } from "./subscription.entity";

export enum Status {
    DRAFT = 'DRAFT',
    ISSUE = 'ISSUE',
    PAID = 'PAID',
    OVERDUE = 'OVERDUE',
}

@Entity({ name: 'invoices' })
export class Invoice {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant

    @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription;

    @Column({ type: 'enum', enum: Status })
    status: Status;

    @Column()
    issueDate: Date;

    @Column()
    dueDate: Date;

    @Column()
    subTotalAmount: number;

    @Column()
    taxAmount: number;

    @Column()
    totalAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}

@Entity({ name: 'invoice_items' })
export class InvoiceItem {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'invoice_id' })
    invoice: Invoice;

    @Column()
    name: string;

    @Column()
    quantity: number;

    @Column()
    unitPrice: number;

    @Column()
    totalAmount: number;

}