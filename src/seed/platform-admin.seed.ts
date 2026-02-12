import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import dataSource from '../../typeorm.master.config';
import { PlatformUser } from '../master-db/entities/platform-user.entity';
import { PlatformRole } from '../master-db/entities/platform-role.entity';

async function seed() {
    await dataSource.initialize();

    const roleRepo = dataSource.getRepository(PlatformRole);
    const userRepo = dataSource.getRepository(PlatformUser);

    let superRole = await roleRepo.findOne({ where: { code: 'SUPER_ADMIN' } });
    if (!superRole) {
        superRole = roleRepo.create({
            code: 'SUPER_ADMIN',
            name: 'Super Admin',
        });
        await roleRepo.save(superRole);
    }

    const email = 'admin@snd.com';

    const exists = await userRepo.findOne({ where: { email } });
    if (!exists) {
        const user = userRepo.create({
            email,
            fullName: 'SND Super Admin',
            passwordHash: await bcrypt.hash('ChangeMe123', 10),
            roles: [superRole],
        });
        await userRepo.save(user);
    }

    console.log('✅ Platform SUPER_ADMIN ready');
    process.exit(0);
}

seed();
