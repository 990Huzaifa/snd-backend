import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Distributor } from "./distributor.entity";
import { Area } from "./area.entity";
import { PJPRoute, PJP } from "./pjp.entity";
import { User } from "./user.entity";
@Entity('routes')
export class Route {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column()
    areaId: string;

    @ManyToOne(() => Area, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'areaId' })
    area: Area;

    @Column()
    distributorId: string;

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

    @Column()
    name: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => PJPRoute, (pjpRoute) => pjpRoute.route)
    pjpRoutes: PJPRoute[];
}

@Entity('route_transfer_logs')
export class RouteTransferLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    fromSalesmanId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'fromSalesmanId' })
    fromSalesman: User;

    @Column()
    toSalesmanId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'toSalesmanId' })
    toSalesman: User;

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
    transferDate: Date;

    @Column()
    reason: string;

    @Column()
    remarks: string;    

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}