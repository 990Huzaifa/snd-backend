import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant } from '../master-db/entities/tenant.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PlatformService {
  constructor (
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {} 

  async resolveTenant(code: string) {
    const tenant = await this.tenantRepo.findOne({ 
      where: { code, isActive: true }, 
      select: ['id', 'name', 'code'],
    });
    if(!tenant) {
      return null
    }
    return tenant
  }
}
