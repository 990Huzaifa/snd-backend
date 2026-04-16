import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: 'addons' })
export class Addon {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    slug: string;

    @Column()
    description: string;

    @Column()
    monthly_price: number;

    @Column()
    yearly_price: number;

    @Column()
    limitKey: string;

    @Column()
    limitValue: number;

    @Column()
    currency: string;

    @Column()
    is_active: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @CreateDateColumn()
    updatedAt: Date;
}