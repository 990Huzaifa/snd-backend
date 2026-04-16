import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CreatePlatformUserDto } from "../dto/create-platform-user.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { PlatformRole } from "src/master-db/entities/platform-role.entity";
import { PlatformUser } from "src/master-db/entities/platform-user.entity";
import { In, Repository } from "typeorm";
import * as bcrypt from 'bcrypt';
import { PlatformPermission } from "src/master-db/entities/platform-premission.entity";
import { CreateRoleDto } from "../dto/role/create-role.dto";
import { UpdateRoleDto } from "../dto/role/update-role.dto";
import { IsUppercase } from "class-validator";

@Injectable()
export class PlatformUserService {

    constructor(
        @InjectRepository(PlatformRole)
        private readonly platformRoleRepo: Repository<PlatformRole>,
        @InjectRepository(PlatformUser)
        private readonly platformUserRepo: Repository<PlatformUser>,
        @InjectRepository(PlatformPermission)
        private readonly platformPermissionRepo: Repository<PlatformPermission>
    ) { }


    async getPlatformPermissionList() {
        const permissions = await this.platformPermissionRepo.find({
            select: ['id', 'name', 'code', 'updatedAt'],
            order: { updatedAt: 'DESC' },
        });

        return {
            result: permissions
        };
    }

    async createPlatformPermission(perData: { name: string; code: string }[]) {
        // Map through the array of permissions and create each permission
        const permissions = await this.platformPermissionRepo.save(
            perData.map(permission => ({
                name: permission.name,
                code: permission.code.toUpperCase(),
                isActive: true, // Set all permissions as active
            }))
        );

        return {
            result: permissions, // Return the created permissions
        };
    }


    async getPlatformRoleList() {
        // 1️⃣ Fetch tenants
        const roles = await this.platformRoleRepo.find({
            select: ['id', 'name', 'code', 'updatedAt'],
            order: { updatedAt: 'DESC' },
        });

        return {
            result: roles
        };
    }

    async getPlatformRole(id: string) {
        const role = await this.platformRoleRepo.findOne({
            where: { id: id },
            relations: ['permissions'],
        });

        return role;
    }

    async createPlatformRole(roleData: CreateRoleDto) {
        const existing = await this.platformRoleRepo.findOne({
            where: { code: roleData.code },
        });

        if (existing) {
            throw new ConflictException('Role with this code already exists');
        }

        const permissions = await this.platformPermissionRepo.find({
            where: {
                code: In(roleData.permissions),
            },
        });

        if (permissions.length !== roleData.permissions.length) {
            throw new NotFoundException('One or more permissions not found');
        }

        const role = await this.platformRoleRepo.save(
            this.platformRoleRepo.create({
                name: roleData.name,
                code: roleData.code,
                isActive: roleData.is_active ?? true,
                permissions: permissions,
            })
        );

        return role;
    }

    async updatePlatformRole(roleId: any, roleData: UpdateRoleDto) {
        const role = await this.platformRoleRepo.findOne({
            where: { id: roleId },
            relations: ['permissions'],
        });

        if (!role) {
            throw new NotFoundException('Role not found');
        }

        const permissions = await this.platformPermissionRepo.find({
            where: {
                code: In(roleData.permissions),
            },
        }); 

        if (permissions.length !== roleData.permissions.length) {
            throw new NotFoundException('One or more permissions not found');
        }

        role.name = roleData.name;
        role.code = roleData.code;
        role.isActive = roleData.is_active ?? true;
        role.permissions = permissions;

        await this.platformRoleRepo.save(role);
        return role;
    }


    // USER

    async getPlatformUserList() {
        // 1️⃣ Fetch tenants
        const users = await this.platformUserRepo.find({
            select: ['id', 'fullName', 'email', 'role', 'updatedAt'],
            order: { updatedAt: 'DESC' },
        });

        return {
            result: users
        };
    }

    async createPlatformUser(dto: CreatePlatformUserDto) {

        let password = String(dto.passwordHash);

        const existing = await this.platformUserRepo.findOne({
            where: { email: dto.email },
        });

        if (existing) {
            throw new ConflictException('User with this email already exists');
        }

        await this.platformUserRepo.save(
            this.platformUserRepo.create({
                fullName: dto.fullname,
                email: dto.email,
                passwordHash: await bcrypt.hash(password, 10),
                role: dto.role
            })
        );

        return {
            message: 'User is created successfully'
        }
    }

    async getPlatformUser(id: string) {
        const user = await this.platformUserRepo.findOne({
            where: { id: id },
            relations: ['role'],
        });

        return user;
    }
}