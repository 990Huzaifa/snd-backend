import { Column, CreateDateColumn, PrimaryGeneratedColumn, Entity, UpdateDateColumn, JoinColumn, OneToMany, ManyToOne } from "typeorm";

export enum LIMIT_KEY {
    USER = 'USER',
    STORAGE = 'STORAGE',
}


@Entity({ name: 'plans' })
export class Plan {

    @PrimaryGeneratedColumn()
    id: string;

    @Column()
    title: string;

    @Column({ nullable: true })
    stripe_price_id: string;

    @Column({ nullable: true })
    payfast_price_id: string;

    @OneToMany(() => PlanLimit, (planLimit) => planLimit.plan) // Assuming it's a OneToMany relation
    planLimits: PlanLimit[];

    @Column()
    slug: string;

    @Column()
    description: string;

    @Column()
    currency: string;

    @Column()
    monthly_price: number;

    @Column()
    yearly_price: number;

    @Column()
    is_active: boolean;

    @Column()
    is_display: boolean;

    @CreateDateColumn()
    createdAt: Date;
    
    @UpdateDateColumn()
    updatedAt: Date;
}


@Entity({ name: 'plan_limits' })
export class PlanLimit {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Plan, (plan) => plan.planLimits , { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'plan_id' })
    plan: Plan;

    @Column({ type: 'enum', enum: LIMIT_KEY })
    limitKey: LIMIT_KEY;

    @Column()
    limitValue: number;
}