import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Area } from 'src/tenant-db/entities/area.entity';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { Region } from 'src/tenant-db/entities/region.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateAreaDto } from '../dto/area/create-area.dto';
import { UpdateAreaDto } from '../dto/area/update-area.dto';

@Injectable()
export class AreaService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async create(tenantDb: DataSource, dto: CreateAreaDto, user: any) {
    const areaRepo = tenantDb.getRepository(Area);
    const regionRepo = tenantDb.getRepository(Region);
    const regionId = dto.regionId.trim();
    const name = dto.name.trim();
    const code = dto.code.trim();

    const region = await regionRepo.findOne({ where: { id: regionId } });
    if (!region) {
      throw new NotFoundException('Region not found');
    }

    const existingArea = await areaRepo.findOne({
      where: { region: { id: regionId }, name },
      relations: ['region'],
    });
    if (existingArea) {
      throw new ConflictException('Area with this name already exists in region');
    }

    const createdArea = await areaRepo.save(
      areaRepo.create({
        region,
        name,
        code,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'AREA_CREATED',
      description: `Area ${createdArea.name} created`,
      metadata: { areaId: createdArea.id, regionId: region.id },
    });

    return createdArea;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    regionId: string | undefined,
    user: any,
  ) {
    const query = tenantDb
      .getRepository(Area)
      .createQueryBuilder('area')
      .leftJoinAndSelect('area.region', 'region')
      .where('1=1');

    const normalizedSearch = search.trim();
    if (normalizedSearch) {
      query.andWhere(
        '(area.name LIKE :search OR area.code LIKE :search)',
        { search: `%${normalizedSearch}%` },
      );
    }

    if (regionId?.trim()) {
      query.andWhere('region.id = :regionId', { regionId: regionId.trim() });
    }

    const [areas, total] = await query
      .orderBy('area.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'AREA_LISTED',
      description: 'Areas listed',
      metadata: { total, page, limit, regionId: regionId || null },
    });

    return { result: areas, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const area = await tenantDb.getRepository(Area).findOne({
      where: { id },
      relations: ['region'],
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'AREA_VIEWED',
      description: `Area ${area.name} viewed`,
      metadata: { areaId: area.id, regionId: area.region?.id ?? null },
    });

    return area;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateAreaDto, user: any) {
    const areaRepo = tenantDb.getRepository(Area);
    const regionRepo = tenantDb.getRepository(Region);

    const area = await areaRepo.findOne({
      where: { id },
      relations: ['region'],
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }

    let nextRegion = area.region;
    if (dto.regionId !== undefined) {
      const region = await regionRepo.findOne({
        where: { id: dto.regionId.trim() },
      });
      if (!region) {
        throw new NotFoundException('Region not found');
      }
      nextRegion = region;
    }

    const nextName = dto.name !== undefined ? dto.name.trim() : area.name;
    if (nextRegion.id !== area.region.id || nextName !== area.name) {
      const duplicateArea = await areaRepo.findOne({
        where: { region: { id: nextRegion.id }, name: nextName },
        relations: ['region'],
      });
      if (duplicateArea && duplicateArea.id !== area.id) {
        throw new ConflictException('Area with this name already exists in region');
      }
    }

    area.region = nextRegion;
    if (dto.name !== undefined) area.name = nextName;
    if (dto.code !== undefined) area.code = dto.code.trim();

    await areaRepo.save(area);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'AREA_UPDATED',
      description: `Area ${area.name} updated`,
      metadata: { areaId: area.id, regionId: area.region.id },
    });

    return area;
  }

  async delete(tenantDb: DataSource, id: string, user: any) {
    const areaRepo = tenantDb.getRepository(Area);
    const distributorRepo = tenantDb.getRepository(Distributor);

    const area = await areaRepo.findOne({
      where: { id },
      relations: ['region'],
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }

    const distributorCount = await distributorRepo.count({
      where: { area: { id: area.id }, isDeleted: false },
    });
    if (distributorCount > 0) {
      throw new ConflictException('Area is in use by distributors and cannot be deleted');
    }

    await areaRepo.remove(area);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'AREA_DELETED',
      description: `Area ${area.name} deleted`,
      metadata: { areaId: area.id, regionId: area.region?.id ?? null },
    });

    return { message: 'Area deleted successfully' };
  }
}
