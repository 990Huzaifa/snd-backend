import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, Like } from 'typeorm';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { CreateTenantRoleDto } from '../dto/role/create-tenant-role.dto';
import { UpdateTenantRoleDto } from '../dto/role/update-tenant-role.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class TenantRoleService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async listRoles(tenantDb: DataSource, page: number, limit: number, search: string, user: any) {
    const roleRepo = tenantDb.getRepository(Role);
    const [roles, total] = await roleRepo.findAndCount({
      where: {
        name: Like(`%${search}%`),
        isActive: true,
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ROLE_LISTED',
      description: `Roles listed`,
      metadata: { total, page, limit },
    });
    return { result: roles, meta: { total, page, limit } };
  }

  async getRoleById(tenantDb: DataSource, id: string, user: any) {
    const role = await tenantDb.getRepository(Role).findOne({
      where: { id },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ROLE_VIEWED',
      description: `Role ${role.name} viewed`,
      metadata: { roleId: role.id },
    });

    return role;
  }

  async createRole(tenantDb: DataSource, dto: CreateTenantRoleDto, user: any) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    const codes = [
      ...new Set(dto.permissions.map((c) => c.toUpperCase())),
    ];

    const existing = await tenantDb.getRepository(Role).findOne({
      where: { code },
    });

    if (existing) {
      throw new ConflictException('Role with this code already exists');
    }

    const permissions = await tenantDb.getRepository(Permission).find({
      where: { code: In(codes) },
    });

    if (permissions.length !== codes.length) {
      throw new NotFoundException('One or more permissions not found');
    }

    const createdRole = await tenantDb.getRepository(Role).save(
      tenantDb.getRepository(Role).create({
        code,
        name,
        isActive: dto.is_active ?? true,
        permissions,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ROLE_CREATED',
      description: `Role ${createdRole.name} created`,
      metadata: { roleId: createdRole.id, code: createdRole.code },
    });

    return createdRole;
  }

  async updateRole(
    tenantDb: DataSource,
    id: string,
    dto: UpdateTenantRoleDto,
    user: any,
  ) {
    const role = await tenantDb.getRepository(Role).findOne({
      where: { id },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (dto.code !== undefined) {
      const nextCode = dto.code.trim().toUpperCase();
      if (nextCode !== role.code) {
        const codeTaken = await tenantDb.getRepository(Role).findOne({
          where: { code: nextCode },
        });
        if (codeTaken) {
          throw new ConflictException('Role with this code already exists');
        }
        role.code = nextCode;
      }
    }

    if (dto.name !== undefined) {
      role.name = dto.name.trim();
    }

    if (dto.is_active !== undefined) {
      role.isActive = dto.is_active;
    }

    if (dto.permissions !== undefined) {
      const codes = [
        ...new Set(dto.permissions.map((c) => c.toUpperCase())),
      ];
      const permissions = await tenantDb.getRepository(Permission).find({
        where: { code: In(codes) },
      });

      if (permissions.length !== codes.length) {
        throw new NotFoundException('One or more permissions not found');
      }
      role.permissions = permissions;
    }

    await tenantDb.getRepository(Role).save(role);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ROLE_UPDATED',
      description: `Role ${role.name} updated`,
      metadata: { roleId: role.id, code: role.code },
    });

    return role;
  }

}
