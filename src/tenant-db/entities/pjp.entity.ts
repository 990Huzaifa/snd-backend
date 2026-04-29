import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Route } from "./route.entity";

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