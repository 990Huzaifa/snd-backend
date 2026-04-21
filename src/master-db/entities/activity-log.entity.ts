import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum ActivityLogActorType {
    PLATFORM_USER = 'PLATFORM_USER',
    SYSTEM = 'SYSTEM',
}

@Entity({ name: 'activity_logs' })
export class ActivityLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        type: 'enum',
        enum: ActivityLogActorType,
    })
    actorType: ActivityLogActorType;

    @Column({nullable: true })
    actorId: string | null;

    @Column({nullable: true })
    tenantId: string | null;

    @Column()
    action: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any> | null;

    @Column({nullable: true })
    jobId: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
