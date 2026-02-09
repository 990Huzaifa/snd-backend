import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
} from 'typeorm';
import { TenantDbConfig } from './tenant-db-config.entity';

@Entity({ name: 'tenants' })
export class Tenant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    code: string; // 🔐 internal resolve code (6-digit / name+digits)

    @Column({ unique: true })
    name: string;

    @Column({ default: true })
    isActive: boolean;

    @OneToOne(() => TenantDbConfig, (db) => db.tenant)
    dbConfig: TenantDbConfig;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
