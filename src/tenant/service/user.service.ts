import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Like, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/common/mail/mail.service';
import { User } from 'src/tenant-db/entities/user.entity';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Designation } from 'src/tenant-db/entities/user.entity';
import { CreateTenantUserDto } from '../dto/user/create-tenant-user.dto';
import { InviteTenantUserDto } from '../dto/user/invite-tenant-user.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class UserService {
  constructor(
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private async generateUniqueUserCode(userRepo: Repository<User>): Promise<string> {
    while (true) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await userRepo.findOne({ where: { code }, select: ['id'] });
      if (!existing) {
        return code;
      }
    }
  }

  private buildUserSetupUrl(
    userCode: string,
    token: string,
    tenantCode?: string,
    requestBaseUrl?: string,
  ) {
    const baseUrl =
      (requestBaseUrl || process.env.TENANT_SETUP_BASE_URL || '')
        .replace(/\/+$/, '');
    const query = new URLSearchParams();
    query.set('token', token);
    if (tenantCode) {
      query.set('tenantCode', tenantCode);
    }
    return `${baseUrl}/user/${userCode}/setup?${query.toString()}`;
  }

  async listUsers(tenantDb: DataSource, page: number, limit: number, search: string, sort: string, sortDirection: string, roleId: string, designationId: string, user: any) {
    const userRepo = tenantDb.getRepository(User);
    const roleRepo = tenantDb.getRepository(Role);
    const designationRepo = tenantDb.getRepository(Designation);
    const totalUsers = await userRepo.count({
      where: {
        isDeleted: false,
      },
    });
    const totalActiveUsers = await userRepo.count({
      where: {
        isDeleted: false,
        isActive: true,
      },
    });
    const totalInactiveUsers = await userRepo.count({
      where: {
        isDeleted: false,
        isActive: false,
      },
    });
    const [users, total] = await userRepo.findAndCount({
      relations: ['role', 'designation'],
      where: {
        name: Like(`%${search}%`),
        id: Not(user.userId),
        role: roleId ? await roleRepo.findOne({ where: { id: roleId } }) : undefined,
        designation: designationId ? await designationRepo.findOne({ where: { id: Number(designationId) } }) : undefined,
        isDeleted: false,
      },
      order: { [sort]: sortDirection },
      skip: (page - 1) * limit,
      take: limit,
    });
    users.forEach(user => {
      delete user.password;
    });

    // remove admin role user from the list
    const filteredusers = users.filter(user => user.role.code !== 'SUPER_ADMIN');
    
    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'USER_LISTED',
      description: `Users listed`,
      metadata: { total, page, limit },
    });
    return {
      result: filteredusers,
      totalUsers,
      totalActiveUsers,
      totalInactiveUsers,
      meta: {
        total: total,
        page,
        limit,
      },
    };
  }

  async getUserById(tenantDb: DataSource, id: string, Authuser: any) {
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: Authuser.userId,
      action: 'USER_VIEWED',
      description: `User ${user.email} viewed`,
      metadata: { userId: user.id },
    });
    return user;
  }
  async createUser(tenantDb: DataSource, dto: CreateTenantUserDto, Authuser: any) {
    const userRepo = tenantDb.getRepository(User);
    const roleRepo = tenantDb.getRepository(Role);
    const designationRepo = tenantDb.getRepository(Designation);
    const code = await this.generateUniqueUserCode(userRepo);
    const email = dto.email.trim().toLowerCase();

    const existingByEmail = await userRepo.findOne({
      where: { email },
      select: ['id'],
    });
    if (existingByEmail) {
      throw new ConflictException('User with this email already exists');
    }

    const existingByCode = await userRepo.findOne({
      where: { code },
      select: ['id'],
    });
    if (existingByCode) {
      throw new ConflictException('User with this code already exists');
    }

    const role = await roleRepo.findOne({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    let designation: Designation | null = null;
    if (dto.designationId !== undefined && dto.designationId !== null) {
      designation = await designationRepo.findOne({
        where: { id: dto.designationId },
      });
      if (!designation) {
        throw new NotFoundException('Designation not found');
      }
    }

    const user = userRepo.create({
      code,
      name: dto.name.trim(),
      email,
      password: await bcrypt.hash(dto.password, 10),
      phone: dto.phone?.trim(),
      role,
      designation,
      joiningDate: dto.joiningDate ?? new Date(),
      leavingDate: dto.leavingDate ?? null,
      cnic: dto.cnic?.trim() ?? null,
      address: dto.address ?? null,
      countryId: dto.countryId ?? null,
      stateId: dto.stateId ?? null,
      cityId: dto.cityId ?? null,
      deviceId: dto.deviceId ?? null,
      fcmToken: dto.fcmToken ?? null,
      isActive: dto.isActive ?? true,
      isDeleted: false,
    });

    const createdUser = await userRepo.save(user);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: Authuser.userId,
      action: 'USER_CREATED',
      description: `User ${createdUser.email} created`,
      metadata: { userId: createdUser.id, roleId: role.id },
    });

    delete createdUser.password;

    return createdUser;
  }

  async updateUserStatus(tenantDb: DataSource, id: string, status: boolean, Authuser: any) {
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isActive = status;
    await userRepo.save(user);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: Authuser.userId,
      action: 'USER_STATUS_UPDATED',
      description: `User ${user.email} status updated`,
      metadata: { userId: user.id, isActive: user.isActive },
    });

    return {
      message: 'User status updated successfully',
      user,
    };
  }
  
  async inviteUser(
    tenantDb: DataSource,
    dto: InviteTenantUserDto,
    tenantCode?: string,
    tenantName?: string,
    requestBaseUrl?: string,
    Authuser?: any,
  ) {
    const userRepo = tenantDb.getRepository(User);
    const roleRepo = tenantDb.getRepository(Role);
    const designationRepo = tenantDb.getRepository(Designation);
    const email = dto.email.trim().toLowerCase();

    const role = await roleRepo.findOne({ where: { id: dto.roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    let designation: Designation | null = null;
    if (dto.designationId !== undefined && dto.designationId !== null) {
      designation = await designationRepo.findOne({
        where: { id: dto.designationId },
      });
      if (!designation) {
        throw new NotFoundException('Designation not found');
      }
    }

    let user = await userRepo.findOne({
      where: { email },
      relations: ['role', 'designation'],
    });

    if (!user) {
      user = userRepo.create({
        code: await this.generateUniqueUserCode(userRepo),
        name: email.split('@')[0],
        email,
        password: null,
        role,
        designation: designation ?? undefined,
        isActive: true,
        isDeleted: false,
      });
    } else {
      if (user.password) {
        throw new ConflictException('User already has an active account');
      }
      user.role = role;
      user.designation = designation ?? undefined;
      user.isActive = true;
      user.isDeleted = false;
    }

    const savedUser = await userRepo.save(user);
    const token = this.jwtService.sign(
      {
        type: 'tenant_user_invite',
        userId: savedUser.id,
        userCode: savedUser.code,
        email: savedUser.email,
      },
      { expiresIn: '7d' },
    );

    const setupUrl = this.buildUserSetupUrl(
      savedUser.code,
      token,
      tenantCode,
      requestBaseUrl,
    );
    const emailHtml = this.mailService.renderTenantUserInviteTemplate({
      logoUrl: process.env.APP_LOGO_URL || 'https://snd.com/logo.png',
      invitedByName: 'your administrator',
      tenantName: tenantName || 'your tenant',
      setupUrl,
      year: new Date().getFullYear(),
    });

    await this.mailService.sendEmail(
      savedUser.email,
      `You're invited to ${tenantName || 'SalesVince'}`,
      emailHtml,
      'noreply@salesvince.com',
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: Authuser?.userId ?? null,
      action: 'USER_INVITED',
      description: `Invitation sent to ${savedUser.email}`,
      metadata: { userId: savedUser.id, email: savedUser.email, roleId: role.id },
    });

    return {
      message: 'Invitation sent successfully',
      userCode: savedUser.code,
      email: savedUser.email,
      setupUrl,
    };
  }
}

