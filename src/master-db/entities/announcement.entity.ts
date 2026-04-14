import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
} from 'typeorm';

export enum DisplayMode {
    BANNER = 'BANNER',
    MODAL = 'MODAL',
}
export enum Type {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS',
}
export enum TargetScope {
    GLOBAL = 'GLOBAL',
    TENANT = 'TENANT',
    PLAN = 'PLAN',
}

import { PlatformUser } from './platform-user.entity';

@Entity({ name: 'announcements' })
export class Announcement {
    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column()
    title?: string;

    @Column()
    message?: string;

    @Column({ default: 1 })
    priority?: number;

    @Column({ default: true })
    isActive?: boolean;

    @Column({ type: 'enum', enum: DisplayMode, default: DisplayMode.BANNER })
    displayMode?: DisplayMode;

    @Column({ type: 'enum', enum: Type, default: Type.INFO })
    type?: Type;

    @Column({ type: 'enum', enum: TargetScope, default: TargetScope.GLOBAL })
    targetScope?: TargetScope;

    @Column({ default: true })
    isDismissable?: boolean;

    @Column({ type: 'timestamp', nullable: true })
    startsAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    endsAt?: Date;

    @OneToOne(() => PlatformUser, { nullable: true })
    createdBy?: PlatformUser
    
    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}

@Entity({ name: 'announcement_tenants' })
export class AnnouncementTenant {

    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column()
    announcement_id?: string;

    @ManyToOne(() => Announcement, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'announcement_id' })
    announcement?: Announcement;

    @Column()
    tenant_id?: string;

    
}

@Entity({ name: 'announcement_plans' })
export class AnnouncementPlan {

    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column()
    announcement_id?: string;

    @ManyToOne(() => Announcement, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'announcement_id' })
    announcement?: Announcement;

    @Column()
    plan_id?: string;

    
}