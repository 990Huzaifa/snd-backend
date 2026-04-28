import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Area } from 'src/tenant-db/entities/area.entity';
import { Region } from 'src/tenant-db/entities/region.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateRegionDto } from '../dto/region/create-region.dto';
import { UpdateRegionDto } from '../dto/region/update-region.dto';

@Injectable()
export class RegionService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async create(tenantDb: DataSource, dto: CreateRegionDto, user: any) {
    const regionRepo = tenantDb.getRepository(Region);
    const cityId = dto.cityId.trim();
    const name = dto.name.trim();
    const code = dto.code?.trim() || null;

    const existingRegion = await regionRepo.findOne({
      where: { cityId, name },
    });

    if (existingRegion) {
      throw new ConflictException('Region with this name already exists in city');
    }

    const createdRegion = await regionRepo.save(
      regionRepo.create({
        cityId,
        name,
        code,
        isActive: dto.isActive ?? true,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'REGION_CREATED',
      description: `Region ${createdRegion.name} created`,
      metadata: { regionId: createdRegion.id, cityId: createdRegion.cityId },
    });

    return createdRegion;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    cityId: string | undefined,
    isActive: string | undefined,
    user: any,
  ) {
    const query = tenantDb
      .getRepository(Region)
      .createQueryBuilder('region')
      .where('1=1');

    const normalizedSearch = search.trim();
    if (normalizedSearch) {
      query.andWhere(
        '(region.name LIKE :search OR region.code LIKE :search OR region.cityId LIKE :search)',
        {
          search: `%${normalizedSearch}%`,
        },
      );
    }

    if (cityId?.trim()) {
      query.andWhere('region.cityId = :cityId', { cityId: cityId.trim() });
    }

    if (isActive === 'true') {
      query.andWhere('region.isActive = true');
    } else if (isActive === 'false') {
      query.andWhere('region.isActive = false');
    }

    const [regions, total] = await query
      .orderBy('region.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'REGION_LISTED',
      description: 'Regions listed',
      metadata: { total, page, limit, cityId: cityId || null, isActive: isActive || null },
    });

    return { result: regions, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const region = await tenantDb.getRepository(Region).findOne({
      where: { id },
      relations: ['areas'],
    });

    if (!region) {
      throw new NotFoundException('Region not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'REGION_VIEWED',
      description: `Region ${region.name} viewed`,
      metadata: { regionId: region.id },
    });

    return region;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateRegionDto, user: any) {
    const regionRepo = tenantDb.getRepository(Region);
    const region = await regionRepo.findOne({ where: { id } });

    if (!region) {
      throw new NotFoundException('Region not found');
    }

    const nextCityId = dto.cityId !== undefined ? dto.cityId.trim() : region.cityId;
    const nextName = dto.name !== undefined ? dto.name.trim() : region.name;

    if (nextCityId !== region.cityId || nextName !== region.name) {
      const duplicateRegion = await regionRepo.findOne({
        where: { cityId: nextCityId, name: nextName },
      });
      if (duplicateRegion && duplicateRegion.id !== region.id) {
        throw new ConflictException('Region with this name already exists in city');
      }
    }

    if (dto.cityId !== undefined) region.cityId = nextCityId;
    if (dto.name !== undefined) region.name = nextName;
    if (dto.code !== undefined) region.code = dto.code?.trim() || null;
    if (dto.isActive !== undefined) region.isActive = dto.isActive;

    await regionRepo.save(region);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'REGION_UPDATED',
      description: `Region ${region.name} updated`,
      metadata: { regionId: region.id, cityId: region.cityId },
    });

    return region;
  }

  async delete(tenantDb: DataSource, id: string, user: any) {
    const regionRepo = tenantDb.getRepository(Region);
    const areaRepo = tenantDb.getRepository(Area);

    const region = await regionRepo.findOne({ where: { id } });
    if (!region) {
      throw new NotFoundException('Region not found');
    }

    const areaCount = await areaRepo.count({
      where: { region: { id: region.id } },
    });
    if (areaCount > 0) {
      throw new ConflictException('Region is in use by areas and cannot be deleted');
    }

    await regionRepo.remove(region);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'REGION_DELETED',
      description: `Region ${region.name} deleted`,
      metadata: { regionId: region.id, cityId: region.cityId },
    });

    return { message: 'Region deleted successfully' };
  }
}
