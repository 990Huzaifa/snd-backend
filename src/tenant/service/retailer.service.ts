import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import {
  Retailer,
  RetailerCategory,
  RetailerChannel,
  RetailerClass,
  Status,
} from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateRetailerDto } from '../dto/retailer/create-retailer.dto';
import { UpdateRetailerDto } from '../dto/retailer/update-retailer.dto';

@Injectable()
export class RetailerService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private normalize(value: string) {
    return value.trim();
  }

  private normalizeOptional(value?: string | null) {
    if (value === undefined || value === null) {
      return undefined;
    }
    const t = value.trim();
    return t === '' ? undefined : t;
  }

  private parsePageLimit(page: number, limit: number) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 10));
    return { page: p, limit: l };
  }

  private async ensureUser(tenantDb: DataSource, userId: string, label: string) {
    const exists = await tenantDb.getRepository(User).findOne({
      where: { id: userId },
      select: ['id'],
    });
    if (!exists) {
      throw new NotFoundException(`${label} not found`);
    }
  }

  async create(tenantDb: DataSource, dto: CreateRetailerDto, user: any) {
    await this.ensureUser(tenantDb, user.userId, 'User');

    const retailerRepo = tenantDb.getRepository(Retailer);
    const route = await tenantDb.getRepository(Route).findOne({
      where: { id: dto.routeId },
    });
    if (!route) {
      throw new NotFoundException('Route not found');
    }
    const category = await tenantDb.getRepository(RetailerCategory).findOne({
      where: { id: dto.retailerCategoryId },
    });
    if (!category) {
      throw new NotFoundException('Retailer category not found');
    }
    const channel = await tenantDb.getRepository(RetailerChannel).findOne({
      where: { id: dto.retailerChannelId },
    });
    if (!channel) {
      throw new NotFoundException('Retailer channel not found');
    }

    const approvedBy = dto.approvedBy?.trim() || user.userId;
    await this.ensureUser(tenantDb, approvedBy, 'Approver user');

    const retailer = retailerRepo.create({
      shopName: this.normalize(dto.shopName),
      ownerName: this.normalize(dto.ownerName),
      image: this.normalizeOptional(dto.image) ?? null,
      Phone: this.normalizeOptional(dto.Phone) ?? null,
      Email: dto.Email !== undefined && dto.Email !== null
        ? this.normalize(dto.Email).toLowerCase()
        : null,
      CNIC: this.normalizeOptional(dto.CNIC) ?? null,
      STRN: this.normalizeOptional(dto.STRN) ?? null,
      NTN: this.normalizeOptional(dto.NTN) ?? null,
      Address: this.normalize(dto.Address),
      latitude: this.normalize(dto.latitude),
      longitude: this.normalize(dto.longitude),
      maxRadius: this.normalize(dto.maxRadius),
      creditLimit: this.normalize(dto.creditLimit),
      class: dto.class,
      status: dto.status ?? Status.PENDING,
      createdBy: user.userId,
      approvedBy,
      routeId: dto.routeId,
      retailerCategoryId: dto.retailerCategoryId,
      retailerChannelId: dto.retailerChannelId,
    });

    const created = await retailerRepo.save(retailer);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CREATED',
      description: `Retailer ${created.shopName} created`,
      metadata: { retailerId: created.id },
    });

    return created;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    routeId: string | undefined,
    retailerCategoryId: string | undefined,
    retailerChannelId: string | undefined,
    status: string | undefined,
    retailerClass: string | undefined,
    areaId: string | undefined,
    user: any,
  ) {
    const { page: p, limit: l } = this.parsePageLimit(page, limit);
    const retailerRepo = tenantDb.getRepository(Retailer);
    const query = retailerRepo
      .createQueryBuilder('retailer')
      .leftJoinAndSelect('retailer.retailerCategory', 'retailerCategory')
      .leftJoinAndSelect('retailer.retailerChannel', 'retailerChannel')
      .leftJoinAndSelect('retailer.route', 'route');

    const normalizedSearch = (search ?? '').trim();
    if (normalizedSearch) {
      query.andWhere(
        new Brackets((sub) => {
          sub
            .where('retailer.shopName LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('retailer.ownerName LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('retailer.Phone LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('retailer.Email LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('retailer.CNIC LIKE :search', { search: `%${normalizedSearch}%` });
        }),
      );
    }

    if (routeId?.trim()) {
      query.andWhere('retailer.routeId = :routeId', { routeId: routeId.trim() });
    }
    if (retailerCategoryId?.trim()) {
      query.andWhere('retailer.retailerCategoryId = :retailerCategoryId', {
        retailerCategoryId: retailerCategoryId.trim(),
      });
    }
    if (retailerChannelId?.trim()) {
      query.andWhere('retailer.retailerChannelId = :retailerChannelId', {
        retailerChannelId: retailerChannelId.trim(),
      });
    }
    if (status?.trim()) {
      const s = status.trim() as Status;
      if (Object.values(Status).includes(s)) {
        query.andWhere('retailer.status = :status', { status: s });
      }
    }
    if (retailerClass?.trim()) {
      const c = retailerClass.trim() as RetailerClass;
      if (Object.values(RetailerClass).includes(c)) {
        query.andWhere('retailer.class = :retailerClass', { retailerClass: c });
      }
    }
    if (areaId?.trim()) {
      query.andWhere('route.areaId = :areaId', { areaId: areaId.trim() });
    }

    const [result, total] = await query
      .orderBy('retailer.createdAt', 'DESC')
      .skip((p - 1) * l)
      .take(l)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_LISTED',
      description: 'Retailers listed',
      metadata: {
        total,
        page: p,
        limit: l,
        routeId: routeId?.trim() || null,
        retailerCategoryId: retailerCategoryId?.trim() || null,
        retailerChannelId: retailerChannelId?.trim() || null,
        status: status?.trim() || null,
        retailerClass: retailerClass?.trim() || null,
        areaId: areaId?.trim() || null,
      },
    });

    return { result, meta: { total, page: p, limit: l } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const retailer = await tenantDb.getRepository(Retailer).findOne({
      where: { id },
      relations: [
        'createdByUser',
        'approvedByUser',
        'retailerCategory',
        'retailerChannel',
        'retailerLedgers',
        'route',
        'route.area',
        'route.area.region',
        'route.distributor',
        'route.distributor.area',
        'route.distributor.area.region',
      ],
    });

    if (!retailer) {
      throw new NotFoundException('Retailer not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_VIEWED',
      description: `Retailer ${retailer.shopName} viewed`,
      metadata: { retailerId: retailer.id },
    });

    return retailer;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateRetailerDto, user: any) {
    const retailerRepo = tenantDb.getRepository(Retailer);
    const retailer = await retailerRepo.findOne({ where: { id } });
    if (!retailer) {
      throw new NotFoundException('Retailer not found');
    }

    if (dto.routeId !== undefined) {
      const route = await tenantDb.getRepository(Route).findOne({
        where: { id: dto.routeId },
      });
      if (!route) {
        throw new NotFoundException('Route not found');
      }
      retailer.routeId = dto.routeId;
    }
    if (dto.retailerCategoryId !== undefined) {
      const category = await tenantDb.getRepository(RetailerCategory).findOne({
        where: { id: dto.retailerCategoryId },
      });
      if (!category) {
        throw new NotFoundException('Retailer category not found');
      }
      retailer.retailerCategoryId = dto.retailerCategoryId;
    }
    if (dto.retailerChannelId !== undefined) {
      const channel = await tenantDb.getRepository(RetailerChannel).findOne({
        where: { id: dto.retailerChannelId },
      });
      if (!channel) {
        throw new NotFoundException('Retailer channel not found');
      }
      retailer.retailerChannelId = dto.retailerChannelId;
    }
    if (dto.approvedBy !== undefined) {
      await this.ensureUser(tenantDb, dto.approvedBy, 'Approver user');
      retailer.approvedBy = dto.approvedBy;
    }

    if (dto.shopName !== undefined) retailer.shopName = this.normalize(dto.shopName);
    if (dto.ownerName !== undefined) retailer.ownerName = this.normalize(dto.ownerName);
    if (dto.image !== undefined) {
      retailer.image = this.normalizeOptional(dto.image) ?? null;
    }
    if (dto.Phone !== undefined) {
      retailer.Phone = this.normalizeOptional(dto.Phone) ?? null;
    }
    if (dto.Email !== undefined) {
      retailer.Email =
        dto.Email === null || dto.Email === ''
          ? null
          : this.normalize(dto.Email).toLowerCase();
    }
    if (dto.CNIC !== undefined) retailer.CNIC = this.normalizeOptional(dto.CNIC) ?? null;
    if (dto.STRN !== undefined) retailer.STRN = this.normalizeOptional(dto.STRN) ?? null;
    if (dto.NTN !== undefined) retailer.NTN = this.normalizeOptional(dto.NTN) ?? null;
    if (dto.Address !== undefined) retailer.Address = this.normalize(dto.Address);
    if (dto.latitude !== undefined) retailer.latitude = this.normalize(dto.latitude);
    if (dto.longitude !== undefined) retailer.longitude = this.normalize(dto.longitude);
    if (dto.maxRadius !== undefined) retailer.maxRadius = this.normalize(dto.maxRadius);
    if (dto.creditLimit !== undefined) {
      retailer.creditLimit = this.normalize(dto.creditLimit);
    }
    if (dto.class !== undefined) retailer.class = dto.class;
    if (dto.status !== undefined) retailer.status = dto.status;

    await retailerRepo.save(retailer);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_UPDATED',
      description: `Retailer ${retailer.shopName} updated`,
      metadata: { retailerId: retailer.id },
    });

    return retailer;
  }

  async updateStatus(tenantDb: DataSource, id: string, status: Status, user: any) {
    const retailerRepo = tenantDb.getRepository(Retailer);
    const retailer = await retailerRepo.findOne({ where: { id } });
    if (!retailer) {
      throw new NotFoundException('Retailer not found');
    }
    retailer.status = status;
    await retailerRepo.save(retailer);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_STATUS_UPDATED',
      description: `Retailer ${retailer.shopName} status set to ${status}`,
      metadata: { retailerId: retailer.id, status },
    });

    return {
      message: 'Retailer status updated successfully',
      retailer: {
        id: retailer.id,
        shopName: retailer.shopName,
        status: retailer.status,
      },
    };
  }
}
