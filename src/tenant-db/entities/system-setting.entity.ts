import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum WeekDay {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn()
  id: number;

  /** Default shop geofence radius in km (used when creating shops / validating visits). */
  @Column({ type: 'varchar', default: '0.5' })
  defaultShopRadius: string;

  /** Expected working hours in a day (e.g. 8). */
  @Column({ type: 'int', default: 8 })
  workingHoursPerDay: number;

  /** Expected working days in a week (e.g. 5). */
  @Column({ type: 'int', default: 5 })
  workingDaysPerWeek: number;

  /** Auto checkout time in 24h format HH:mm (e.g. 18:00). */
  @Column({ type: 'varchar', length: 5, default: '18:00' })
  autoCheckoutTime: string;

  /**
   * Weekly off / holiday days.
   * Examples: [FRIDAY], [SUNDAY], [SATURDAY, SUNDAY]
   */
  @Column({
    type: 'jsonb',
    default: () => `'["SATURDAY","SUNDAY"]'`,
  })
  weeklyHolidays: WeekDay[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
