import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Route } from "./route.entity";

export enum PJPStatus {
    PENDING = 'PENDING',
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

@Entity('pjp_plans')
export class PJP {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    weekStartDate: Date;

    @Column()
    weekEndDate: Date;

    @Column({nullable: true})
    salesmanId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'salesmanId' })
    salesman: User;

    @Column({ type: 'enum', enum: PJPStatus, default: PJPStatus.PENDING })
    status: PJPStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('pjp_routes')
export class PJPRoute {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    pjpId: string;

    @ManyToOne(() => PJP, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'pjpId' })
    pjp: PJP;

    @Column()
    routeId: string;

    @ManyToOne(() => Route, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'routeId' })
    route: Route;

    @Column()
    visitDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}