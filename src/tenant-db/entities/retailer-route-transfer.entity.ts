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
import { Route } from './route.entity';
import { Retailer } from './retailer.entity';
import { User } from './user.entity';

export type RetailerRouteTransferJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type RetailerRouteTransferItemStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

@Entity('retailer_route_transfer_jobs')
export class RetailerRouteTransferJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  destinationRouteId: string;

  @ManyToOne(() => Route, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destinationRouteId' })
  destinationRoute: Route;

  @Column({ type: 'timestamptz' })
  effectiveDate: Date;

  @Column()
  reason: string;

  @Column({ nullable: true })
  remarks: string | null;

  @Column({ default: 'PENDING' })
  status: RetailerRouteTransferJobStatus;

  @Column({ default: '' })
  errorMessage: string;

  @Column()
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ nullable: true })
  tenantJobId: string | null;

  @OneToMany(() => RetailerRouteTransferJobItem, (item) => item.job)
  items: RetailerRouteTransferJobItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('retailer_route_transfer_job_items')
export class RetailerRouteTransferJobItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  jobId: string;

  @ManyToOne(() => RetailerRouteTransferJob, (job) => job.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'jobId' })
  job: RetailerRouteTransferJob;

  @Column()
  retailerId: string;

  @ManyToOne(() => Retailer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'retailerId' })
  retailer: Retailer;

  @Column({ nullable: true })
  fromRouteId: string | null;

  @ManyToOne(() => Route, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fromRouteId' })
  fromRoute: Route | null;

  @Column({ default: 'PENDING' })
  status: RetailerRouteTransferItemStatus;

  @Column({ default: '' })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
