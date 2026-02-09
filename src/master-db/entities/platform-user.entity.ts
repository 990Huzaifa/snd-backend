import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToMany,
    JoinTable,
} from 'typeorm';
import { PlatformRole } from './platform-role.entity';

@Entity({ name: 'platform_users' })
export class PlatformUser {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index({ unique: true })
    @Column()
    email: string;

    @Column()
    fullName: string;

    @Column()
    passwordHash: string; // bcrypt later (Step 5)

    @Column({ default: true })
    isActive: boolean;

    @ManyToMany(() => PlatformRole, { eager: true })
    @JoinTable({
        name: 'platform_user_roles',
        joinColumn: { name: 'platform_user_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'platform_role_id', referencedColumnName: 'id' },
    })
    roles: PlatformRole[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
