import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Tenant } from "./tenant.entity";
import { Plan } from "./plan.entity";

export enum Status {
    ACTIVE = 'ACTIVE',
    PAST_DUE = 'PAST_DUE',
    SUSPENDED = 'SUSPENDED',
    EXPIRED = 'EXPIRED',
}
export enum BillingCycle {
    MONTHLY = 'MONTHLY',
    YEARLY = 'YEARLY',
}

export enum BillingModel {
    SELF_SERVE = 'SELF_SERVE',
    SALES_DRIVEN = 'SALES_DRIVEN',
}

export enum PaymentMode {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
}

export enum CollectionType {
    AUTO = 'AUTO',
    MANUAL = 'MANUAL',
}

@Entity({ name: 'subscriptions' })
export class Subscription {

    @PrimaryGeneratedColumn()
    id: number;

    @OneToOne(() => Plan, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'plan_id' })
    plan: Plan;

    @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant;

    @Column({ type: 'enum', enum: BillingCycle })
    billingCycle: BillingCycle;

    @Column({ type: 'enum', enum: BillingModel })
    billingModel: BillingModel;

    @Column({ type: 'enum', enum: PaymentMode })
    paymentMode: PaymentMode;

    @Column({ type: 'enum', enum: CollectionType })
    collectionType: CollectionType;

    @Column({ type: 'enum', enum: Status })
    status: Status;

    @Column()
    expiresAt: Date;

    @Column()
    cancelledAt: Date;

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}