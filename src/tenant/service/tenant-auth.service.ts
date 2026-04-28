import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant, TenantStatus } from 'src/master-db/entities/tenant.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import { User } from 'src/tenant-db/entities/user.entity';
import { TenantLoginDto } from '../dto/tenant-login.dto';
import { SetupTenantUserPasswordDto } from '../dto/user/setup-tenant-user-password.dto';

/**
 * First label of host is treated as tenantCode unless it is `api` or `www`.
 * Examples: acme.salesvince.com -> acme; api.salesvince.com -> none (use body).
 */
export function extractTenantCodeFromHost(hostHeader: string | undefined): string | undefined {
  if (!hostHeader) {
    return undefined;
  }
  const host = hostHeader.split(':')[0].toLowerCase();
  const parts = host.split('.');
  if (parts.length < 3) {
    return undefined;
  }
  const first = parts[0];
  if (first === 'api' || first === 'www') {
    return undefined;
  }
  return parts[0];
}

@Injectable()
export class TenantAuthService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    dto: TenantLoginDto,
    hostHeader: string | undefined,
  ): Promise<{ access_token: string; user: User }> {
    console.log('hostHeader', hostHeader);
    const fromHost = extractTenantCodeFromHost(hostHeader);
    console.log('fromHost', fromHost);
    const tenantName = (fromHost ?? dto.tenantName)?.trim();
    if (!tenantName) {
      throw new BadRequestException(
        'Tenant could not be resolved: use a tenant subdomain or pass tenantCode in the body',
      );
    }

    const tenant = await this.tenantRepo.findOne({
      where: [{ name: tenantName }],
      select: ['id', 'code', 'name', 'isActive', 'status'],
      relations: ['profile'],
    });

    if (!tenant) {
      throw new UnauthorizedException('Invalid tenant or credentials');
    }
    if (!tenant.isActive) {
      throw new UnauthorizedException('Tenant is inactive');
    }
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new UnauthorizedException('Tenant is suspended');
    }
    if (tenant.status !== TenantStatus.PROVISIONED) {
      throw new UnauthorizedException('Tenant is not ready for login');
    }

    const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
    const userRepo = tenantDb.getRepository(User);
    const email = dto.email.trim().toLowerCase();

    const user = await userRepo.findOne({
      where: { email },
      relations: ['role'],
    });

    if (
      !user ||
      !user.password ||
      !user.isActive ||
      user.isDeleted ||
      !user.role
    ) {
      throw new UnauthorizedException('Invalid tenant or credentials');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid tenant or credentials');
    }

    const payload = {
      type: 'tenant' as const,
      sub: user.id,
      userId: user.id,
      tenantId: tenant.id,
      role: user.role.name,
      tenantStatus: tenant.status,
      tenantCode: tenant.code,
      tenantName: tenant.profile.displayName,
    };

    delete user.password;

    return {
      access_token: this.jwtService.sign(payload),
      user: user,
    };
  }

  async setupInvitedUserPassword(
    dto: SetupTenantUserPasswordDto,
    hostHeader: string | undefined,
  ) {
    const fromHost = extractTenantCodeFromHost(hostHeader);
    const tenantCode = (fromHost ?? dto.tenantCode)?.trim();

    if (!tenantCode) {
      throw new BadRequestException(
        'Tenant could not be resolved: use a tenant subdomain or pass tenantCode in the body',
      );
    }

    const tenant = await this.tenantRepo.findOne({
      where: [{ code: tenantCode }, { name: tenantCode }],
      select: ['id', 'isActive', 'status'],
    });
    if (!tenant || !tenant.isActive || tenant.status !== TenantStatus.PROVISIONED) {
      throw new UnauthorizedException('Invalid tenant context');
    }

    let invitePayload: {
      type: string;
      userId: string;
      userCode: string;
      email: string;
    };
    try {
      invitePayload = this.jwtService.verify(dto.token);
    } catch {
      throw new UnauthorizedException('Invalid or expired invite token');
    }

    if (invitePayload.type !== 'tenant_user_invite') {
      throw new UnauthorizedException('Invalid invite token type');
    }

    const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: invitePayload.userId },
      select: ['id', 'code', 'email', 'password', 'isDeleted', 'isActive'],
    });

    if (
      !user ||
      user.isDeleted ||
      !user.isActive ||
      user.code !== invitePayload.userCode ||
      user.email !== invitePayload.email
    ) {
      throw new UnauthorizedException('Invite user is invalid');
    }

    user.password = await bcrypt.hash(dto.password, 10);
    await userRepo.save(user);

    return { message: 'Password setup completed successfully' };
  }
}
