import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('system_settings')
export class SystemSetting {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: true })
    key: string;

    @Column({ nullable: true })
    value: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}