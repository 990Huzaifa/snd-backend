import { Column, CreateDateColumn, PrimaryGeneratedColumn, Entity, UpdateDateColumn } from "typeorm";

@Entity({ name: 'plans' })
export class Plan {

    @PrimaryGeneratedColumn()
    id: string;

    @Column()
    title: string;

    @Column({ nullable: true })
    stripe_price_id: string;

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