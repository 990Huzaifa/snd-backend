import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { Designation } from 'src/tenant-db/entities/user.entity';
import { CreateTenantDesignationDto } from '../dto/designation/create-tenant-designation.dto';
import { UpdateTenantDesignationDto } from '../dto/designation/update-tenant-designation.dto';

@Injectable()
export class TenantDesignationService {
  private toId(id: string): number {
    const parsed = Number(id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('Invalid designation id');
    }
    return parsed;
  }

  async listDesignations(tenantDb: DataSource, page: number, limit: number, search: string) {
    const designationRepo = tenantDb.getRepository(Designation);
    const [designations, total] = await designationRepo.findAndCount({
      where: {
        slug: Like(`%${search}%`),
        name: Like(`%${search}%`),
        isActive: true,
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { result: designations, meta: { total, page, limit } };
  }

  async getDesignationById(tenantDb: DataSource, id: string) {
    const designationId = this.toId(id);
    const designation = await tenantDb.getRepository(Designation).findOne({
      where: { id: designationId },
    });

    if (!designation) {
      throw new NotFoundException('Designation not found');
    }

    return designation;
  }

  async createDesignation(tenantDb: DataSource, dto: CreateTenantDesignationDto) {
    const slug = dto.slug.trim().toLowerCase();
    const existingBySlug = await tenantDb.getRepository(Designation).findOne({
      where: { slug },
    });

    if (existingBySlug) {
      throw new ConflictException('Designation with this slug already exists');
    }

    return tenantDb.getRepository(Designation).save(
      tenantDb.getRepository(Designation).create({
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        isActive: dto.is_active ?? true,
      }),
    );
  }

  async updateDesignation(
    tenantDb: DataSource,
    id: string,
    dto: UpdateTenantDesignationDto,
  ) {
    const designationId = this.toId(id);
    const designation = await tenantDb.getRepository(Designation).findOne({
      where: { id: designationId },
    });

    if (!designation) {
      throw new NotFoundException('Designation not found');
    }

    if (dto.slug !== undefined) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== designation.slug) {
        const slugTaken = await tenantDb.getRepository(Designation).findOne({
          where: { slug: nextSlug },
        });
        if (slugTaken) {
          throw new ConflictException('Designation with this slug already exists');
        }
        designation.slug = nextSlug;
      }
    }

    if (dto.name !== undefined) {
      designation.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      designation.description = dto.description?.trim() || null;
    }

    if (dto.is_active !== undefined) {
      designation.isActive = dto.is_active;
    }

    await tenantDb.getRepository(Designation).save(designation);
    return designation;
  }

  async updateDesignationStatus(tenantDb: DataSource, id: string, status: boolean) {
    const designationId = this.toId(id);
    const designation = await tenantDb.getRepository(Designation).findOne({
      where: { id: designationId },
    });
    if (!designation) {
      throw new NotFoundException('Designation not found');
    }
    designation.isActive = status;
    await tenantDb.getRepository(Designation).save(designation);
    return {
      message: 'Designation status updated successfully',
      designation,
    };
  }

  async list(tenantDb: DataSource) {
    const designations = await tenantDb
      .getRepository(Designation)
      .createQueryBuilder('designation')
      .select([
        'designation.id',
        'designation.name',
        'designation.slug',
        'designation.description',
        'designation.isActive',
        'designation.updatedAt',
      ])
      .orderBy('designation.updatedAt', 'DESC')
      .getMany();

    return { result: designations };
  }
}
