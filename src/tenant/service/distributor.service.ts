import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, Repository } from 'typeorm';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { Area } from 'src/tenant-db/entities/area.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateDistributorDto } from '../dto/distributor/create-distributor.dto';
import { UpdateDistributorDto } from '../dto/distributor/update-distributor.dto';
import { MasterGeoHelperService } from './master-geo-helper.service';

@Injectable()
export class DistributorService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
  ) {}

  private normalize(value: string) {
    return value.trim();
  }

  private async generateUniqueUserCode(distributorRepo: Repository<Distributor>): Promise<string> {
    while (true) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await distributorRepo.findOne({ where: { code }, select: ['id'] });
      if (!existing) {
        return code;
      }
    }
  }

  private parseBoolean(value?: string): boolean | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return undefined;
  }

  private async attachGeoNames<T extends { countryId?: string | null; stateId?: string | null; cityId?: string | null }>(
    data: T,
  ): Promise<T & { countryName: string | null; stateName: string | null; cityName: string | null }> {
    const [countryName, stateName, cityName] = await Promise.all([
      this.masterGeoHelperService.getCountryNameById(data.countryId),
      this.masterGeoHelperService.getStateNameById(data.stateId),
      this.masterGeoHelperService.getCityNameById(data.cityId),
    ]);

    return {
      ...data,
      countryName,
      stateName,
      cityName,
    };
  }

  async create(tenantDb: DataSource, dto: CreateDistributorDto, user: any) {
    const distributorRepo = tenantDb.getRepository(Distributor);
    const areaRepo = tenantDb.getRepository(Area);

    const area = await areaRepo.findOne({
      where: { id: dto.areaId },
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }

    const code = await this.generateUniqueUserCode(distributorRepo);
    
    const distributor = distributorRepo.create({
      code,
      name: this.normalize(dto.name),
      email: this.normalize(dto.email).toLowerCase(),
      phone: this.normalize(dto.phone),
      address: this.normalize(dto.address),
      countryId: dto.countryId?.trim() || null,
      stateId: dto.stateId?.trim() || null,
      cityId: dto.cityId?.trim() || null,
      area,
      postalCode: this.normalize(dto.postalCode),
      locationTitle: this.normalize(dto.locationTitle),
      latitude: dto.latitude,
      longitude: dto.longitude,
      maxRadius: this.normalize(dto.maxRadius) ?? '0.5',
      isActive: dto.isActive ?? true,
    });

    const createdDistributor = await distributorRepo.save(distributor);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'DISTRIBUTOR_CREATED',
      description: `Distributor ${createdDistributor.name} created`,
      metadata: { distributorId: createdDistributor.id, code: createdDistributor.code },
    });

    return createdDistributor;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    areaId: string | undefined,
    isActive: string | undefined,
    user: any,
  ) {
    const distributorRepo = tenantDb.getRepository(Distributor);
    const query = distributorRepo
      .createQueryBuilder('distributor')
      .leftJoinAndSelect('distributor.area', 'area')
      .where('distributor.isDeleted = :isDeleted', { isDeleted: false });

    const normalizedSearch = search.trim();
    if (normalizedSearch) {
      query.andWhere(
        new Brackets((subQuery) => {
          subQuery
            .where('distributor.name LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('distributor.code LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('distributor.email LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('distributor.phone LIKE :search', { search: `%${normalizedSearch}%` });
        }),
      );
    }

    if (areaId?.trim()) {
      query.andWhere('area.id = :areaId', { areaId: areaId.trim() });
    }

    const activeFilter = this.parseBoolean(isActive);
    if (activeFilter !== undefined) {
      query.andWhere('distributor.isActive = :isActive', { isActive: activeFilter });
    }

    const [distributors, total] = await query
      .orderBy('distributor.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'DISTRIBUTOR_LISTED',
      description: 'Distributors listed',
      metadata: { total, page, limit, areaId: areaId || null, isActive: activeFilter },
    });

    return { result: distributors, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const distributor = await tenantDb.getRepository(Distributor).findOne({
      where: { id, isDeleted: false },
      relations: ['area', 'area.region'],
    });

    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }

    const distributorWithGeoNames = await this.attachGeoNames(distributor);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'DISTRIBUTOR_VIEWED',
      description: `Distributor ${distributor.name} viewed`,
      metadata: { distributorId: distributor.id },
    });

    return distributorWithGeoNames;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateDistributorDto, user: any) {
    const distributorRepo = tenantDb.getRepository(Distributor);
    const areaRepo = tenantDb.getRepository(Area);

    const distributor = await distributorRepo.findOne({
      where: { id, isDeleted: false },
      relations: ['area'],
    });

    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }

    if (dto.areaId !== undefined) {
      const area = await areaRepo.findOne({ where: { id: dto.areaId } });
      if (!area) {
        throw new NotFoundException('Area not found');
      }
      distributor.area = area;
    }

    if (dto.name !== undefined) distributor.name = this.normalize(dto.name);
    if (dto.email !== undefined) distributor.email = this.normalize(dto.email).toLowerCase();
    if (dto.phone !== undefined) distributor.phone = this.normalize(dto.phone);
    if (dto.address !== undefined) distributor.address = this.normalize(dto.address);
    if (dto.countryId !== undefined) distributor.countryId = dto.countryId?.trim() || null;
    if (dto.stateId !== undefined) distributor.stateId = dto.stateId?.trim() || null;
    if (dto.cityId !== undefined) distributor.cityId = dto.cityId?.trim() || null;
    if (dto.postalCode !== undefined) distributor.postalCode = this.normalize(dto.postalCode);
    if (dto.locationTitle !== undefined) {
      distributor.locationTitle = this.normalize(dto.locationTitle);
    }
    if (dto.latitude !== undefined) distributor.latitude = dto.latitude;
    if (dto.longitude !== undefined) distributor.longitude = dto.longitude;
    if (dto.maxRadius !== undefined) distributor.maxRadius = this.normalize(dto.maxRadius);
    if (dto.isActive !== undefined) distributor.isActive = dto.isActive;

    await distributorRepo.save(distributor);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'DISTRIBUTOR_UPDATED',
      description: `Distributor ${distributor.name} updated`,
      metadata: { distributorId: distributor.id, code: distributor.code },
    });

    return distributor;
  }

  async updateStatus(tenantDb: DataSource, id: string, status: boolean, user: any) {
    const distributor = await tenantDb.getRepository(Distributor).findOne({
      where: { id, isDeleted: false },
    });
    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }
    distributor.isActive = status;
    await tenantDb.getRepository(Distributor).save(distributor);
    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'DISTRIBUTOR_STATUS_UPDATED',
      description: `Distributor ${distributor.name} status updated to ${status}`,
      metadata: { distributorId: distributor.id, status },
    });
    return {
      message: 'Distributor status updated successfully',
      distributor: {
        id: distributor.id,
        name: distributor.name,
        status: distributor.isActive,
      },
    };
  }
}
