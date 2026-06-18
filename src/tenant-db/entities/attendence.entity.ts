import { Column, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Distributor } from "./distributor.entity";

export enum AttendenceStatus {
    PRESENT = 'PRESENT',
    ABSENT = 'ABSENT',
    LEAVE = 'LEAVE',
    WORK_FROM_HOME = 'WORK_FROM_HOME',
    REMOTE = 'REMOTE',
}

@Entity('attendences')
export class Attendence {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ nullable: true })
    distributorId: string | null;

    @ManyToOne(() => Distributor, { onDelete: 'RESTRICT', nullable: true })
    @JoinColumn({ name: 'distributorId' })
    distributor: Distributor;

    @Column()
    attendenceDate: Date;

    @Column({nullable: true})
    checkInLocation: string;

    @Column({nullable: true})
    checkInTime: Date;

    @Column({nullable: true, type: 'decimal', precision: 10, scale: 8 })
    checkInLatitude: number;

    @Column({nullable: true, type: 'decimal', precision: 10, scale: 8 })
    checkInLongitude: number;



    @Column({nullable: true})
    checkOutLocation: string;

    @Column({nullable: true})
    checkOutTime: Date;

    @Column({nullable: true, type: 'decimal', precision: 10, scale: 8 })
    checkOutLatitude: number;

    @Column({nullable: true, type: 'decimal', precision: 10, scale: 8 })
    checkOutLongitude: number;

    @Column({ type: 'enum', enum: AttendenceStatus })
    status: AttendenceStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('attendence_tracking_logs')
export class TrackingLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    attendenceId: string;

    @ManyToOne(() => Attendence, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'attendenceId' })
    attendence: Attendence;

    @Column({type: 'decimal', precision: 10, scale: 8})
    latitude: number;

    @Column({type: 'decimal', precision: 10, scale: 8})
    longitude: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}