import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Tenant, TenantStatus } from 'src/master-db/entities/tenant.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TenantJwtGuard implements CanActivate {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as { tenantId?: string } | undefined;
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('tenantId claim missing in JWT');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId, isActive: true },
      select: ['id', 'name', 'code', 'status'],
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found or inactive');
    }

    if (tenant.status !== TenantStatus.PROVISIONED) {
      throw new ForbiddenException(
        `Tenant access blocked (status: ${tenant.status})`,
      );
    }

    req.tenant = {
      isPlatform: false,
      tenantId: tenant.id,
      name: tenant.name,
      code: tenant.code,
      status: tenant.status,
    };

    return true;
  }
}
