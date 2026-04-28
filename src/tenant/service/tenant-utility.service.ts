import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Designation } from 'src/tenant-db/entities/user.entity';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { Region } from 'src/tenant-db/entities/region.entity';
import { Area } from 'src/tenant-db/entities/area.entity';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';

@Injectable()
export class TenantUtilityService {
  async getDesignations(tenantDb: DataSource) {
    const designations = await tenantDb.getRepository(Designation).find({
      where: { isActive: true },
      select: ['id', 'name', 'slug', 'description'],
      order: { name: 'ASC' },
    });

    return { result: designations };
  }

  async getRoles(tenantDb: DataSource) {
    const roles = await tenantDb.getRepository(Role).find({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        permissions: false,
      },
      order: { name: 'ASC' },
    });

    return { result: roles };
  }

  async getPermissions(tenantDb: DataSource) {
    const permissions = await tenantDb.getRepository(Permission).find({
      where: { isActive: true },
      select: ['id', 'code', 'name'],
      order: { name: 'ASC' },
    });

    return { result: permissions };
  }

  async getRegions(tenantDb: DataSource) {
    const regions = await tenantDb.getRepository(Region).find({
      where: { isActive: true },
      select: ['id', 'name', 'code'],
      order: { name: 'ASC' },
    });

    return { result: regions };
  }

  async getAreas(tenantDb: DataSource, regionId: string) {
    const areas = await tenantDb.getRepository(Area).find({
      where: { region: { id: regionId }},
      select: ['id', 'name', 'code'],
      order: { name: 'ASC' },
    });

    return { result: areas };
  }

  async getDistributors(tenantDb: DataSource, areaId: string) {
    const distributors = await tenantDb.getRepository(Distributor).find({
      where: { area: { id: areaId }},
      select: ['id', 'name', 'code'],
      order: { name: 'ASC' },
    });

    return { result: distributors };
  }
}
