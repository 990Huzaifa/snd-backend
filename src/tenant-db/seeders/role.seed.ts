import { DataSource } from 'typeorm';
import { Role } from '../entities/role.entity';

export const TENANT_ROLES = [
    {
        name: 'Super Admin',
    },
];

export async function seedTenantRoles(dataSource: DataSource) {
    const roleRepo = dataSource.getRepository(Role);

    console.log('🌱 Seeding tenant roles...');

    for (const roleData of TENANT_ROLES) {
        const existing = await roleRepo.findOne({
            where: { name: roleData.name },
        });

        if (!existing) {
            const role = roleRepo.create(roleData);
            await roleRepo.save(role);
            console.log(`✅ Role created: ${roleData.name}`);
        } else {
            console.log(`⏭ Role already exists: ${roleData.name}`);
        }
    }

    console.log('🌱 Tenant role seeding completed.\n');
}
