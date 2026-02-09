import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant, TenantStatus } from '../master-db/entities/tenant.entity';
import { Repository } from 'typeorm';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) { }

  private async generateUniqueCode(): Promise<string> {
    while (true) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      const exists = await this.tenantRepo.findOne({
        where: { code },
      });

      if (!exists) {
        return code;
      }
    }
  }
  async resolveTenant(code: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { code, isActive: true },
      select: ['id', 'name', 'code'],
    });
    if (!tenant) {
      return null
    }
    return tenant
  }

  async createTenant(dto: CreateTenantDto) {
    // 1️⃣ Subdomain uniqueness check
    const nameExists = await this.tenantRepo.findOne({
      where: { name: dto.name },
    });

    if (nameExists) {
      throw new ConflictException('Tenant name already exists');
    }

    // 2️⃣ Generate unique code
    const code = await this.generateUniqueCode();

    // 3️⃣ Create tenant identity
    const tenant = this.tenantRepo.create({
      name: dto.name,
      email: dto.email,
      code: code,
      isActive: true,
    });

    return this.tenantRepo.save(tenant);
  }

  async startProvisioning(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });
    if(!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== TenantStatus.REGISTERED) {
      throw new ConflictException(
        `Cannot provision tenant in status ${tenant.status}`,
      );
    }

    tenant.status = TenantStatus.PROVISIONING;
    await this.tenantRepo.save(tenant);

    return {
      message: 'Provisioning started',
      status: tenant.status,
    };
  }
}
