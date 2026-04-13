import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Announcement } from "./announcement.entity";


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