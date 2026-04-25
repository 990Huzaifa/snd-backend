import { DataSource } from 'typeorm';
import { seedTenantPermissions } from './permission.seed';
import { seedTenantRoles } from './role.seed';
import { seedTenantDesignations } from './designation.seed';
import { seedTenantSuperAdminUser } from './super-admin-user.seed';

export async function runTenantSeeders(dataSource: DataSource) {
  console.log('\n🚀 Running Tenant Seeders...\n');

  // Required order:
  // 1) permissions
  // 2) roles (assign permission to role)
  // 3) designations
  // 4) users (assign role/designation to user)
  await seedTenantPermissions(dataSource);
  await seedTenantRoles(dataSource);
  await seedTenantDesignations(dataSource);
  await seedTenantSuperAdminUser(dataSource);

  console.log('🎉 Tenant seeders completed successfully.\n');
}
