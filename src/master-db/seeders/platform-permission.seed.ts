import { DataSource } from 'typeorm';
import { PlatformPermission } from '../entities/platform-premission.entity';

export const PLATFORM_PERMISSIONS = [
    { code: 'TENANT_VIEW', name: 'View Tenant' },
    { code: 'TENANT_CREATE', name: 'Create Tenant' },
    { code: 'TENANT_UPDATE', name: 'Update Tenant' },
    { code: 'TENANT_SUSPEND', name: 'Suspend Tenant' },
    { code: 'MODULE_MANAGE', name: 'Manage Modules' },
    { code: 'BILLING_VIEW', name: 'View Billing' },
];

export async function seedPlatformPermissions(dataSource: DataSource) {
    const repo = dataSource.getRepository(PlatformPermission);

    console.log('🌱 Seeding platform permissions...');

    for (const perm of PLATFORM_PERMISSIONS) {
        const existing = await repo.findOne({
            where: { code: perm.code },
        });

        if (!existing) {
            await repo.save(repo.create(perm));
            console.log(`✅ Permission created: ${perm.code}`);
        } else {
            console.log(`⏭ Permission already exists: ${perm.code}`);
        }
    }

    console.log('🌱 Platform permission seeding completed.\n');
}
