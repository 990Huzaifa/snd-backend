import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { SalesmanDistributor } from './user.entity';
import { Area } from './area.entity';
import { Route } from './route.entity';
import { PurchaseStock } from './purchase-stock.entity';
import { OpeningStock } from './opening-stock.entity';
import { StockTransfer } from './stock-transfer.entity';
import { StockBalance, StockMovement } from './stock.entity';

@Entity('distributors')
export class Distributor {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    code: string;

    @Column()
    email: string;

    @Column()
    phone: string;

    @Column()
    address: string;

    @Column({nullable: true})
    countryId: string;

    @Column({nullable: true})
    stateId: string;

    @Column({nullable: true})
    cityId: string;

    @ManyToOne(() => Area, (area) => area.distributors)
    @JoinColumn({ name: 'areaId' })
    area: Area;

    @Column()
    postalCode: string;

    @Column()
    locationTitle: string;

    @Column()
    latitude: string;

    @Column()
    longitude: string;

    @Column()
    maxRadius: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isDeleted: boolean;

    @OneToMany(() => SalesmanDistributor, (salesmanDistributor) => salesmanDistributor.distributor)
    distributorUsers: SalesmanDistributor[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => Route, (route) => route.distributor)
    routes: Route[];

    @OneToMany(() => PurchaseStock, (purchaseStock) => purchaseStock.distributor)
    purchaseStocks: PurchaseStock[];

    @OneToMany(() => OpeningStock, (openingStock) => openingStock.distributor)
    openingStocks: OpeningStock[];

    @OneToMany(() => StockTransfer, (stockTransfer) => stockTransfer.fromDistributor)
    fromStockTransfers: StockTransfer[];
    
    @OneToMany(() => StockTransfer, (stockTransfer) => stockTransfer.toDistributor)
    toStockTransfers: StockTransfer[];

    @OneToMany(() => StockMovement, (stockMovement) => stockMovement.distributor)
    stockMovements: StockMovement[];

    @OneToMany(() => StockBalance, (stockBalance) => stockBalance.distributor)
    stockBalances: StockBalance[];
}