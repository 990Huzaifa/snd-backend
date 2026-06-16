import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Between, Brackets, DataSource, EntityManager } from 'typeorm';
import { Asset, AssetStatus } from 'src/tenant-db/entities/asset.entity';
import {
  Retailer,
  RetailerCategory,
  RetailerChannel,
  RetailerClass,
  RefType,
  Status,
  RetailerLedger,
} from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { ActivityLogService } from '../activity-log.service';
import { CreateRetailerDto } from '../../dto/retailer/create-retailer.dto';
import { UpdateRetailerDto } from '../../dto/retailer/update-retailer.dto';
import {
  ASSET_RULES,
  AssetEntityType,
  AssetPurpose,
} from '../../config/asset-rules.config';
import { S3Service } from 'src/common/s3/s3.service';
import { RetailerLedgerService } from './retailer-ledger.service';

@Injectable()
export class RetailerService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly s3Service: S3Service,
    private readonly retailerLedgerService: RetailerLedgerService,
  ) {}

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

  private dedupeAssetIdsPreserveOrder(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }

  private async collectApprovedRetailerImageUrls(
    manager: EntityManager,
    tenantCode: string,
    assetIds: string[],
    user: { userId: string },
  ): Promise<string[]> {
    const assetRepo = manager.getRepository(Asset);
    const urls: string[] = [];

    for (const assetId of assetIds) {
      const asset = await assetRepo.findOne({ where: { id: assetId } });
      if (!asset) {
        throw new NotFoundException(`Asset ${assetId} not found`);
      }
      if (asset.uploadedById !== user.userId) {
        throw new ForbiddenException(`Not allowed to use asset ${assetId}`);
      }
      if (asset.status !== AssetStatus.APPROVED) {
        throw new BadRequestException(
          `Asset ${assetId} must be confirmed (APPROVED) before attaching to a retailer`,
        );
      }
      if (asset.purpose !== AssetPurpose.RETAILER_IMAGE) {
        throw new BadRequestException(`Asset ${assetId} is not a retailer image`);
      }
      if (asset.entityId != null || asset.attachedAt != null) {
        throw new BadRequestException(`Asset ${assetId} is already linked to an entity`);
      }
      const retailerImageRules = ASSET_RULES[AssetPurpose.RETAILER_IMAGE];
      const tempPrefix = `tenants/${tenantCode}/temp/uploads/${asset.id}.`;
      const finalPrefix = `tenants/${tenantCode}/${retailerImageRules.folder}/${asset.id}.`;
      if (!asset.s3Key.startsWith(tempPrefix) && !asset.s3Key.startsWith(finalPrefix)) {
        throw new BadRequestException(`Asset ${assetId} has an unexpected storage key`);
      }
      urls.push(this.s3Service.getObjectUrl(asset.s3Key));
    }

    return urls;
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

  async create(
    tenantDb: DataSource,
    tenantCode: string,
    dto: CreateRetailerDto,
    user: any,
  ) {
    await this.ensureUser(tenantDb, user.userId, 'User');

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
    //if status is pending, then approvedBy is null else approvedBy is the user id
    const approvedBy = dto.status === Status.PENDING ? null : user.userId;
    const uniqueAssetIds = dto.assetIds?.length
      ? this.dedupeAssetIdsPreserveOrder(
          dto.assetIds.map((id) => id.trim()).filter(Boolean),
        )
      : [];

    const created = await tenantDb.transaction(async (manager) => {
      const retailerRepo = manager.getRepository(Retailer);
      const assetRepo = manager.getRepository(Asset);

      let retailerImage = this.normalizeOptional(dto.image) ?? null;
      if (uniqueAssetIds.length) {
        const urls = await this.collectApprovedRetailerImageUrls(
          manager,
          tenantCode,
          uniqueAssetIds,
          user,
        );
        retailerImage = urls.join(',');
      }

      const retailer = retailerRepo.create({
        shopName: this.normalize(dto.shopName),
        ownerName: this.normalize(dto.ownerName),
        image: retailerImage,
        phone: this.normalizeOptional(dto.phone) ?? null,
        email:
          dto.email !== undefined && dto.email !== null
            ? this.normalize(dto.email).toLowerCase()
            : null,
        CNIC: this.normalizeOptional(dto.CNIC) ?? null,
        STRN: this.normalizeOptional(dto.STRN) ?? null,
        NTN: this.normalizeOptional(dto.NTN) ?? null,
        address: this.normalize(dto.address),
        latitude: this.normalize(dto.latitude),
        longitude: this.normalize(dto.longitude),
        maxRadius: this.normalize(dto.maxRadius),
        creditLimit: this.normalize(dto.creditLimit),
        class: dto.class,
        status: dto.status ?? Status.PENDING,
        createdBy: user.userId,
        approvedBy: approvedBy,
        routeId: dto.routeId,
        retailerCategoryId: dto.retailerCategoryId,
        retailerChannelId: dto.retailerChannelId,
      });

      const savedRetailer = await retailerRepo.save(retailer);

      if (uniqueAssetIds.length) {
        const now = new Date();
        for (const assetId of uniqueAssetIds) {
          await assetRepo.update(
            { id: assetId },
            {
              entityType: AssetEntityType.RETAILER,
              entityId: savedRetailer.id,
              attachedAt: now,
            },
          );
        }
      }

      // create a retailer ledger with the opening balance if opening balance is provided
      if (dto.openingBalance && Number(dto.openingBalance) > 0) {
        await this.retailerLedgerService.createDebitEntry(manager, {
          retailerId: savedRetailer.id,
          refType: RefType.OPENING_BALANCE,
          amount: dto.openingBalance,
        });
      }

      return savedRetailer;
    });


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
            .orWhere('retailer.phone LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('retailer.email LIKE :search', { search: `%${normalizedSearch}%` })
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

  async edit(
    tenantDb: DataSource,
    tenantCode: string,
    id: string,
    dto: UpdateRetailerDto,
    user: any,
  ) {
    const updatedRetailer = await tenantDb.transaction(async (manager) => {
      const retailerRepo = manager.getRepository(Retailer);
      const assetRepo = manager.getRepository(Asset);
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
      if (dto.assetIds !== undefined) {
        await assetRepo.update(
          {
            entityType: AssetEntityType.RETAILER,
            entityId: retailer.id,
            purpose: AssetPurpose.RETAILER_IMAGE,
          },
          {
            entityType: null,
            entityId: null,
            attachedAt: null,
          },
        );

        const uniqueAssetIds = dto.assetIds.length
          ? this.dedupeAssetIdsPreserveOrder(
              dto.assetIds.map((aid) => aid.trim()).filter(Boolean),
            )
          : [];

        if (uniqueAssetIds.length) {
          const urls = await this.collectApprovedRetailerImageUrls(
            manager,
            tenantCode,
            uniqueAssetIds,
            user,
          );
          retailer.image = urls.join(',');
        } else {
          retailer.image = this.normalizeOptional(dto.image) ?? null;
        }
      } else if (dto.image !== undefined) {
        retailer.image = this.normalizeOptional(dto.image) ?? null;
      }
      if (dto.phone !== undefined) {
        retailer.phone = this.normalizeOptional(dto.phone) ?? null;
      }
      if (dto.email !== undefined) {
        retailer.email =
          dto.email === null || dto.email === ''
            ? null
            : this.normalize(dto.email).toLowerCase();
      }
      if (dto.CNIC !== undefined) retailer.CNIC = this.normalizeOptional(dto.CNIC) ?? null;
      if (dto.STRN !== undefined) retailer.STRN = this.normalizeOptional(dto.STRN) ?? null;
      if (dto.NTN !== undefined) retailer.NTN = this.normalizeOptional(dto.NTN) ?? null;
      if (dto.address !== undefined) retailer.address = this.normalize(dto.address);
      if (dto.latitude !== undefined) retailer.latitude = this.normalize(dto.latitude);
      if (dto.longitude !== undefined) retailer.longitude = this.normalize(dto.longitude);
      if (dto.maxRadius !== undefined) retailer.maxRadius = this.normalize(dto.maxRadius);
      if (dto.creditLimit !== undefined) {
        retailer.creditLimit = this.normalize(dto.creditLimit);
      }
      if (dto.class !== undefined) retailer.class = dto.class;
      if (dto.status !== undefined) retailer.status = dto.status;

      await retailerRepo.save(retailer);

      if (dto.assetIds !== undefined) {
        const uniqueAssetIds = dto.assetIds.length
          ? this.dedupeAssetIdsPreserveOrder(
              dto.assetIds.map((aid) => aid.trim()).filter(Boolean),
            )
          : [];
        if (uniqueAssetIds.length) {
          const now = new Date();
          for (const assetId of uniqueAssetIds) {
            await assetRepo.update(
              { id: assetId },
              {
                entityType: AssetEntityType.RETAILER,
                entityId: retailer.id,
                attachedAt: now,
              },
            );
          }
        }
      }

      return retailer;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_UPDATED',
      description: `Retailer ${updatedRetailer.shopName} updated`,
      metadata: { retailerId: updatedRetailer.id },
    });

    return updatedRetailer;
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

  async getLedger(tenantDb: DataSource, id: string, user: any, startDate?: string, endDate?: string) {
    const retailer = await tenantDb.getRepository(Retailer).findOne({ where: { id } });
    if (!retailer) {
      throw new NotFoundException('Retailer not found');
    }
    const whereCondition: any = { retailerId: id };
    if (startDate && endDate) {
      whereCondition.createdAt = Between(new Date(startDate), new Date(endDate));
    }
    const ledger = await tenantDb.getRepository(RetailerLedger).find({ where: whereCondition });
    const totalDebit = ledger.reduce((acc, curr) => acc + Number(curr.debit), 0);
    const totalCredit = ledger.reduce((acc, curr) => acc + Number(curr.credit), 0);
    const result = await tenantDb.transaction(async (manager) => {
      const openingBalance = await this.retailerLedgerService.getOpeningBalance(manager, id);
      const closingBalance = await this.retailerLedgerService.getClosingBalance(manager, id);
      return {
        openingBalance,
        totalDebit,
        totalCredit,
        closingBalance
      };
    });
    return {
      result,
      ledger
    };
  }
}
