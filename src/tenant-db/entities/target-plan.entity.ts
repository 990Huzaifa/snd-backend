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
import { User, UserType } from './user.entity';
import { Product, ProductCategory } from './product.entity';

export enum TargetPlanStatus {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    LOCKED = 'LOCKED',
    CLOSED = 'CLOSED',
    CANCELLED = 'CANCELLED',
}

export enum TargetPlanAssigneeStatus {
    ACTIVE = 'ACTIVE',
    REMOVED = 'REMOVED',
}

export enum MetricType {
    SALES_VALUE = 'SALES_VALUE',
    PRODUCT_QTY = 'PRODUCT_QTY',
    CATEGORY_QTY = 'CATEGORY_QTY',
    RETAILER_VISITS = 'RETAILER_VISITS',
    NEW_RETAILERS = 'NEW_RETAILERS',
}

@Entity('target_plans')
export class TargetPlanEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    cityId: string;

    @Column()
    startDate: Date;

    @Column()
    endDate: Date;

    @Column({ type: 'enum', enum: TargetPlanStatus, default: TargetPlanStatus.DRAFT })
    status: TargetPlanStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => TargetPlanAssigneeEntity, (assignee) => assignee.targetPlan)
    assignees: TargetPlanAssigneeEntity[];

    @OneToMany(() => TargetMetricEntity, (metric) => metric.targetPlan)
    metrics: TargetMetricEntity[];
}

@Entity('target_plan_assignees')
export class TargetPlanAssigneeEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    targetPlanId: string;

    @ManyToOne(() => TargetPlanEntity, (plan) => plan.assignees, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'targetPlanId' })
    targetPlan: TargetPlanEntity;

    @Column({ type: 'enum', enum: UserType })
    userType: UserType;

    @Column()
    assigneeId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'assigneeId' })
    assignee: User;

    @Column({ type: 'enum', enum: TargetPlanAssigneeStatus, default: TargetPlanAssigneeStatus.ACTIVE })
    status: TargetPlanAssigneeStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => TargetAchievementSnapshotEntity, (snapshot) => snapshot.targetAssignee)
    snapshots: TargetAchievementSnapshotEntity[];
}

@Entity('target_metrics')
export class TargetMetricEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    targetPlanId: string;

    @ManyToOne(() => TargetPlanEntity, (plan) => plan.metrics, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'targetPlanId' })
    targetPlan: TargetPlanEntity;

    @Column({ type: 'enum', enum: MetricType })
    metricType: MetricType;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    targetValue: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => TargetMetricItemEntity, (item) => item.targetMetric)
    items: TargetMetricItemEntity[];

    @OneToMany(() => TargetAchievementSnapshotEntity, (snapshot) => snapshot.targetMetric)
    snapshots: TargetAchievementSnapshotEntity[];
}

@Entity('target_metric_items')
export class TargetMetricItemEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    targetMetricId: string;

    @ManyToOne(() => TargetMetricEntity, (metric) => metric.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'targetMetricId' })
    targetMetric: TargetMetricEntity;

    @Column({ type: 'enum', enum: MetricType })
    metricType: MetricType;

    @Column({ nullable: true })
    productId: string | null;

    @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'productId' })
    product: Product | null;

    @Column({ nullable: true })
    categoryId: string | null;

    @ManyToOne(() => ProductCategory, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'categoryId' })
    category: ProductCategory | null;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    targetQuantity: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    targetAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('target_achievement_snapshots')
export class TargetAchievementSnapshotEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    targetAssigneeId: string;

    @ManyToOne(() => TargetPlanAssigneeEntity, (assignee) => assignee.snapshots, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'targetAssigneeId' })
    targetAssignee: TargetPlanAssigneeEntity;

    @Column()
    targetMetricId: string;

    @ManyToOne(() => TargetMetricEntity, (metric) => metric.snapshots, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'targetMetricId' })
    targetMetric: TargetMetricEntity;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    targetValue: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    achievementValue: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    achievementPercentage: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    remainingValue: number;

    @Column({ nullable: true })
    calculatedFrom: Date | null;

    @Column({ nullable: true })
    calculatedTo: Date | null;

    @Column()
    calculatedAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
