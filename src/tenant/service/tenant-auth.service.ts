import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/common/mail/mail.service';
import { Tenant, TenantStatus } from 'src/master-db/entities/tenant.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import { DeviceApprovedStatus, User } from 'src/tenant-db/entities/user.entity';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyResetOtpDto,
} from '../dto/auth/forgot-password.dto';
import { TenantLoginDto } from '../dto/tenant-login.dto';
import { SetupTenantUserPasswordDto } from '../dto/user/setup-tenant-user-password.dto';
import { ActivityLogService } from './activity-log.service';

const PASSWORD_RESET_OTP_EXPIRY_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TOKEN_EXPIRY = '15m';
const MAX_PASSWORD_RESET_OTP_ATTEMPTS = 5;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'If an account exists for this email, a reset code has been sent.';

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
    private readonly activityLogService: ActivityLogService,
    private readonly mailService: MailService,
  ) {}

  private async resolveProvisionedTenant(
    tenantCode: string | undefined,
    hostHeader: string | undefined,
  ): Promise<Tenant> {
    const fromHost = extractTenantCodeFromHost(hostHeader);
    const tenantName = (fromHost ?? tenantCode)?.trim();

    if (!tenantName) {
      throw new BadRequestException(
        'Tenant could not be resolved: use a tenant subdomain or pass tenantCode in the body',
      );
    }

    const tenant = await this.tenantRepo.findOne({
      where: [{ name: tenantName }, { code: tenantName }],
      select: ['id', 'code', 'name', 'isActive', 'status'],
      relations: ['profile'],
    });

    if (!tenant || !tenant.isActive || tenant.status !== TenantStatus.PROVISIONED) {
      throw new UnauthorizedException('Invalid tenant context');
    }

    return tenant;
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private clearPasswordResetOtp(user: User): void {
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpiresAt = null;
    user.passwordResetOtpAttempts = 0;
  }

  private isPasswordResetEligible(user: User): boolean {
    return (
      !!user.password &&
      user.isActive &&
      !user.isDeleted
    );
  }

  private getTenantBranding(tenant: Tenant) {
    const logoUrl =
      tenant.profile?.logoUrl ||
      process.env.APP_LOGO_URL ||
      'https://snd.com/logo.png';
    const tenantName = tenant.profile?.displayName || tenant.name;

    return { logoUrl, tenantName };
  }

  async forgotPassword(dto: ForgotPasswordDto, hostHeader: string | undefined) {
    const tenant = await this.resolveProvisionedTenant(dto.tenantCode, hostHeader);
    const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
    const userRepo = tenantDb.getRepository(User);
    const email = dto.email.trim().toLowerCase();

    const user = await userRepo.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'name',
        'password',
        'isActive',
        'isDeleted',
        'passwordResetOtpExpiresAt',
        'updatedAt',
      ],
    });

    if (!user || !this.isPasswordResetEligible(user)) {
      return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
    }

    const now = Date.now();
    if (
      user.passwordResetOtpExpiresAt &&
      user.passwordResetOtpExpiresAt.getTime() > now &&
      user.updatedAt &&
      now - user.updatedAt.getTime() < PASSWORD_RESET_RESEND_COOLDOWN_MS
    ) {
      return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
    }

    const otp = this.generateOtp();
    user.passwordResetOtpHash = await bcrypt.hash(otp, 10);
    user.passwordResetOtpExpiresAt = new Date(now + PASSWORD_RESET_OTP_EXPIRY_MS);
    user.passwordResetOtpAttempts = 0;
    await userRepo.save(user);

    const { logoUrl, tenantName } = this.getTenantBranding(tenant);
    const emailHtml = this.mailService.renderTenantOtpTemplate({
      logoUrl,
      tenantName,
      recipientName: user.name,
      otp,
      heading: 'Reset Your Password',
      message: 'We received a request to reset your password. Use the verification code below to continue.',
      expiryMinutes: PASSWORD_RESET_OTP_EXPIRY_MS / 60_000,
      year: new Date().getFullYear(),
    });

    await this.mailService.sendEmail(
      user.email,
      `Password reset code - ${tenantName}`,
      emailHtml,
      'noreply@salesvince.com',
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.id,
      action: 'USER_PASSWORD_RESET_REQUESTED',
      description: `Password reset OTP sent to ${user.email}`,
      metadata: { userId: user.id },
    });

    return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
  }

  async verifyResetOtp(dto: VerifyResetOtpDto, hostHeader: string | undefined) {
    const tenant = await this.resolveProvisionedTenant(dto.tenantCode, hostHeader);
    const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
    const userRepo = tenantDb.getRepository(User);
    const email = dto.email.trim().toLowerCase();

    const user = await userRepo.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'passwordResetOtpHash',
        'passwordResetOtpExpiresAt',
        'passwordResetOtpAttempts',
        'isActive',
        'isDeleted',
        'password',
      ],
    });

    if (!user || !this.isPasswordResetEligible(user)) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (
      !user.passwordResetOtpHash ||
      !user.passwordResetOtpExpiresAt ||
      user.passwordResetOtpExpiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (user.passwordResetOtpAttempts >= MAX_PASSWORD_RESET_OTP_ATTEMPTS) {
      this.clearPasswordResetOtp(user);
      await userRepo.save(user);
      throw new BadRequestException(
        'Too many failed attempts. Please request a new code.',
      );
    }

    const otpValid = await bcrypt.compare(dto.otp, user.passwordResetOtpHash);
    if (!otpValid) {
      user.passwordResetOtpAttempts += 1;
      await userRepo.save(user);
      throw new BadRequestException('Invalid or expired verification code');
    }

    const resetToken = this.jwtService.sign(
      {
        type: 'tenant_password_reset',
        userId: user.id,
        tenantId: tenant.id,
        email: user.email,
      },
      { expiresIn: PASSWORD_RESET_TOKEN_EXPIRY },
    );

    return { resetToken };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let resetPayload: {
      type: string;
      userId: string;
      tenantId: string;
      email: string;
    };

    try {
      resetPayload = this.jwtService.verify(dto.resetToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (resetPayload.type !== 'tenant_password_reset') {
      throw new UnauthorizedException('Invalid reset token type');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: resetPayload.tenantId },
      select: ['id', 'isActive', 'status'],
    });

    if (!tenant || !tenant.isActive || tenant.status !== TenantStatus.PROVISIONED) {
      throw new UnauthorizedException('Invalid tenant context');
    }

    const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: resetPayload.userId },
      select: [
        'id',
        'email',
        'password',
        'isActive',
        'isDeleted',
        'passwordResetOtpHash',
        'passwordResetOtpExpiresAt',
        'passwordResetOtpAttempts',
      ],
    });

    if (
      !user ||
      !this.isPasswordResetEligible(user) ||
      user.email !== resetPayload.email
    ) {
      throw new UnauthorizedException('Invalid reset request');
    }

    user.password = await bcrypt.hash(dto.password, 10);
    this.clearPasswordResetOtp(user);
    await userRepo.save(user);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.id,
      action: 'USER_PASSWORD_RESET_COMPLETED',
      description: `Password reset completed for ${user.email}`,
      metadata: { userId: user.id },
    });

    return { message: 'Password reset successfully' };
  }

  async login(
    dto: TenantLoginDto,
    origin: string | undefined,
  ): Promise<{ access_token: string; user: Omit<User, 'assignedDistributors'> & {
    assignedDistributors: Array<{
      id: number;
      userId: string;
      distributorId: string;
      name: string | null;
      latitude: string | null;
      longitude: string | null;
      maxRadius: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  } }> {
    const fromHost = extractTenantCodeFromHost(origin);
    const tenantName = (fromHost ?? dto.tenantCode)?.trim();
    // console.log('tenantName', tenantName);
    if (!tenantName) {
      throw new BadRequestException(
        'Tenant could not be resolved: use a tenant subdomain or pass tenantCode in the body',
      );
    }

    const tenant = await this.tenantRepo.findOne({
      where: [{ name: tenantName }, { code: tenantName }],
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
      relations: [
        'role',
        'assignedDistributors',
        'assignedDistributors.distributor',
      ],
    });

    if (
      !user ||
      !user.password ||
      !user.role
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.role.code !== 'SUPER_ADMIN') {
        
      // if user is not active, throw an error
      if (!user.isActive) {
        throw new UnauthorizedException('User is not active contact your administrator');
      }

      // if user is deleted, throw an error
      if (user.isDeleted) {
        throw new UnauthorizedException('User is deleted contact your administrator');
      }

      this.applyDeviceBinding(user, dto);
      user.fcmToken = dto.fcmToken ?? null;
      await userRepo.save(user);
      this.assertDeviceApprovedForLogin(user);
      
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

    const userResponse = {
      ...user,
      assignedDistributors: (user.assignedDistributors ?? []).map((assignment) => ({
        id: assignment.id,
        userId: assignment.userId,
        distributorId: assignment.distributorId,
        name: assignment.distributor?.name ?? null,
        latitude: assignment.distributor?.latitude ?? null,
        longitude: assignment.distributor?.longitude ?? null,
        maxRadius: assignment.distributor?.maxRadius ?? null,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      })),
    };

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.id,
      action: 'USER_LOGIN',
      description: `User ${user.email} logged in`,
      metadata: { userId: user.id },
    });

    return {
      access_token: this.jwtService.sign(payload),
      user: userResponse,
    };
  }

  /**
   * One registered device per user. A new deviceId requires admin approval
   * unless the account is already approved with no device bound yet.
   */
  private applyDeviceBinding(user: User, dto: TenantLoginDto): void {
    const incomingDeviceId = dto.deviceId?.trim() || null;

    if (!incomingDeviceId) {
      if (user.deviceId) {
        throw new UnauthorizedException('deviceId is required for this account');
      }
      return;
    }

    if (!user.deviceId) {
      user.deviceId = incomingDeviceId;
      if (user.deviceApprovedStatus !== DeviceApprovedStatus.APPROVED) {
        user.deviceApprovedStatus = DeviceApprovedStatus.WAITING;
      }
      return;
    }

    if (user.deviceId !== incomingDeviceId) {
      user.deviceId = incomingDeviceId;
      user.deviceApprovedStatus = DeviceApprovedStatus.WAITING;
    }
  }

  private assertDeviceApprovedForLogin(user: User): void {
    if (user.deviceApprovedStatus === DeviceApprovedStatus.WAITING) {
      return;
    }
    if (user.deviceApprovedStatus === DeviceApprovedStatus.REJECTED) {
      throw new UnauthorizedException(
        'Device was rejected. Contact your administrator to register a new device',
      );
    }
    if (user.deviceApprovedStatus !== DeviceApprovedStatus.APPROVED) {
      throw new UnauthorizedException(
        'Device is not approved. Contact your administrator',
      );
    }
  }

  async checkAccount(tenantDb: DataSource, userId: string) {
    const user = await tenantDb.getRepository(User).findOne({
      where: { id: userId },
      select: ['id', 'isActive', 'isDeleted', 'deviceApprovedStatus'],
    });

    if (!user || user.isDeleted) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    if (user.deviceApprovedStatus === DeviceApprovedStatus.REJECTED) {
      throw new UnauthorizedException('Device was rejected. Contact your administrator to register a new device');
    }
    if (user.deviceApprovedStatus === DeviceApprovedStatus.WAITING) {
      return { deviceApprovedStatus: DeviceApprovedStatus.WAITING };
    }
    if (user.deviceApprovedStatus === DeviceApprovedStatus.APPROVED) {
      return { deviceApprovedStatus: DeviceApprovedStatus.APPROVED };
    }
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

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.id,
      action: 'USER_PASSWORD_SETUP',
      description: `Password setup completed for ${user.email}`,
      metadata: { userId: user.id },
    });

    return { message: 'Password setup completed successfully' };
  }

}
