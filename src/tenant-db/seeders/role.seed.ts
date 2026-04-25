import { DataSource } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';

export const TENANT_ROLES = [
    {
        name: 'Super Admin',
    },
];

export async function seedTenantRoles(dataSource: DataSource) {
    const roleRepo = dataSource.getRepository(Role);
    const permissionRepo = dataSource.getRepository(Permission);

    console.log('🌱 Seeding tenant roles...');

    for (const roleData of TENANT_ROLES) {
        const roleName = roleData.name.trim();
        if (!roleName) {
            continue;
        }

        const existing = await roleRepo.findOne({
            where: { name: roleName },
        });

        if (!existing) {
            const role = roleRepo.create({ name: roleName });
            await roleRepo.save(role);
            console.log(`✅ Role created: ${roleName}`);
        } else {
            console.log(`⏭ Role already exists: ${roleName}`);
        }
    }

    const superAdminRole = await roleRepo.findOne({
        where: { name: 'Super Admin' },
        relations: ['permissions'],
    });
    if (superAdminRole) {
        const permissions = await permissionRepo.find({
            where: { isActive: true },
        });
        superAdminRole.permissions = permissions;
        await roleRepo.save(superAdminRole);
        console.log('✅ Super Admin role permissions assigned');
    }

    console.log('🌱 Tenant role seeding completed.\n');
}
