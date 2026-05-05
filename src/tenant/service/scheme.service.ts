import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Product, ProductCategory, ProductPricing } from 'src/tenant-db/entities/product.entity';
import { Retailer, RetailerChannel } from 'src/tenant-db/entities/retailer.entity';
import {
  Scheme,
  SchemeProduct,
  SchemeProductCategory,
  SchemeRetailer,
  SchemeRetailerChannel,
  SchemeSlab,
} from 'src/tenant-db/entities/scheme.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateSchemeDto } from '../dto/scheme/create-scheme.dto';
import { UpdateSchemeDto } from '../dto/scheme/update-scheme.dto';

@Injectable()
export class SchemeService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private toUniqueIds(ids?: string[]): string[] {
    return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
  }

  private normalizeSchemeProducts(
    schemeProducts?: Array<{ productId: string; productPricingId: string }>,
  ): Array<{ productId: string; productPricingId: string }> {
    const normalized: Array<{ productId: string; productPricingId: string }> = [];
    const seen = new Set<string>();

    for (const item of schemeProducts ?? []) {
      const productId = item.productId.trim();
      const productPricingId = item.productPricingId.trim();
      if (!productId || !productPricingId) {
        continue;
      }
      const pairKey = `${productId}:${productPricingId}`;
      if (seen.has(pairKey)) {
        continue;
      }
      seen.add(pairKey);
      normalized.push({ productId, productPricingId });
    }

    return normalized;
  }

  private async ensureIdsExist(
    tenantDb: DataSource,
    ids: string[],
    repoEntity: new () => any,
    label: string,
  ) {
    if (!ids.length) {
      return;
    }
    const count = await tenantDb.getRepository(repoEntity).count({
      where: { id: In(ids) },
    });
    if (count !== ids.length) {
      throw new NotFoundException(`One or more ${label} not found`);
    }
  }

  private async ensureNameUnique(
    tenantDb: DataSource,
    name: string,
    excludeId?: string,
  ) {
    const qb = tenantDb
      .getRepository(Scheme)
      .createQueryBuilder('scheme')
      .where('scheme.name = :name', { name })
      .andWhere('scheme.isDeleted = false');

    if (excludeId) {
      qb.andWhere('scheme.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException('Scheme with this name already exists');
    }
  }

  private validateDateRange(startDate: Date, endDate: Date) {
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid scheme dates');
    }
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }
  }

  private async ensureSchemeProductsValid(
    tenantDb: DataSource,
    schemeProducts: Array<{ productId: string; productPricingId: string }>,
  ) {
    if (!schemeProducts.length) {
      return;
    }

    await this.ensureIdsExist(
      tenantDb,
      this.toUniqueIds(schemeProducts.map((item) => item.productId)),
      Product,
      'products',
    );

    const uniquePricingIds = this.toUniqueIds(
      schemeProducts.map((item) => item.productPricingId),
    );
    const pricingRows = await tenantDb.getRepository(ProductPricing).find({
      where: { id: In(uniquePricingIds) },
      select: ['id', 'productId'],
    });
    if (pricingRows.length !== uniquePricingIds.length) {
      throw new NotFoundException('One or more product pricings not found');
    }

    const pricingProductMap = new Map(
      pricingRows.map((pricing) => [pricing.id, pricing.productId]),
    );
    for (const pair of schemeProducts) {
      if (pricingProductMap.get(pair.productPricingId) !== pair.productId) {
        throw new BadRequestException(
          `Pricing ${pair.productPricingId} does not belong to product ${pair.productId}`,
        );
      }
    }
  }

  private async createRelations(
    manager: EntityManager,
    schemeId: string,
    dto: CreateSchemeDto | UpdateSchemeDto,
  ) {
    const slabRepo = manager.getRepository(SchemeSlab);
    const retailerRepo = manager.getRepository(SchemeRetailer);
    const productRepo = manager.getRepository(SchemeProduct);
    const categoryRepo = manager.getRepository(SchemeProductCategory);
    const channelRepo = manager.getRepository(SchemeRetailerChannel);

    if (dto.slabs) {
      const slabs = dto.slabs.map((slab) =>
        slabRepo.create({
          scheme: { id: schemeId },
          minQuantity: slab.minQuantity,
          maxQuantity: slab.maxQuantity,
          benefitValue: slab.benefitValue.trim(),
        }),
      );
      if (slabs.length) {
        await slabRepo.save(slabs);
      }
    }

    const retailerIds = this.toUniqueIds(dto.retailerIds);
    if (retailerIds.length) {
      await retailerRepo.save(
        retailerIds.map((retailerId) =>
          retailerRepo.create({
            scheme: { id: schemeId },
            retailer: { id: retailerId },
          }),
        ),
      );
    }

    const schemeProducts = this.normalizeSchemeProducts(dto.schemeProducts);
    if (schemeProducts.length) {
      await productRepo.save(
        schemeProducts.map((item) =>
          productRepo.create({
            scheme: { id: schemeId },
            product: { id: item.productId },
            productPricing: { id: item.productPricingId },
          }),
        ),
      );
    }

    const productCategoryIds = this.toUniqueIds(dto.productCategoryIds);
    if (productCategoryIds.length) {
      await categoryRepo.save(
        productCategoryIds.map((productCategoryId) =>
          categoryRepo.create({
            scheme: { id: schemeId },
            productCategory: { id: productCategoryId },
          }),
        ),
      );
    }

    const retailerChannelIds = this.toUniqueIds(dto.retailerChannelIds);
    if (retailerChannelIds.length) {
      await channelRepo.save(
        retailerChannelIds.map((retailerChannelId) =>
          channelRepo.create({
            scheme: { id: schemeId },
            retailerChannel: { id: retailerChannelId },
          }),
        ),
      );
    }
  }

  async create(tenantDb: DataSource, dto: CreateSchemeDto, user: any) {
    const name = dto.name.trim();
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.validateDateRange(startDate, endDate);

    await this.ensureNameUnique(tenantDb, name);
    await this.ensureSchemeProductsValid(
      tenantDb,
      this.normalizeSchemeProducts(dto.schemeProducts),
    );
    await this.ensureIdsExist(
      tenantDb,
      this.toUniqueIds(dto.retailerIds),
      Retailer,
      'retailers',
    );
    await this.ensureIdsExist(
      tenantDb,
      this.toUniqueIds(dto.productCategoryIds),
      ProductCategory,
      'product categories',
    );
    await this.ensureIdsExist(
      tenantDb,
      this.toUniqueIds(dto.retailerChannelIds),
      RetailerChannel,
      'retailer channels',
    );

    const created = await tenantDb.transaction(async (manager) => {
      const schemeRepo = manager.getRepository(Scheme);
      const scheme = await schemeRepo.save(
        schemeRepo.create({
          name,
          schemeType: dto.schemeType,
          benefitType: dto.benefitType,
          startDate,
          endDate,
          isActive: dto.isActive ?? true,
          isDeleted: false,
        }),
      );

      await this.createRelations(manager, scheme.id, dto);
      return scheme;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SCHEME_CREATED',
      description: `Scheme ${created.name} created`,
      metadata: { schemeId: created.id },
    });

    return this.view(tenantDb, created.id, user);
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    isActive: string | undefined,
    user: any,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 10));
    const query = tenantDb
      .getRepository(Scheme)
      .createQueryBuilder('scheme')
      .where('scheme.isDeleted = false');

    if (search?.trim()) {
      query.andWhere('scheme.name LIKE :search', { search: `%${search.trim()}%` });
    }
    if (isActive === 'true') {
      query.andWhere('scheme.isActive = true');
    } else if (isActive === 'false') {
      query.andWhere('scheme.isActive = false');
    }

    const [result, total] = await query
      .orderBy('scheme.createdAt', 'DESC')
      .skip((p - 1) * l)
      .take(l)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SCHEME_LISTED',
      description: 'Schemes listed',
      metadata: { total, page: p, limit: l, isActive: isActive || null },
    });

    return { result, meta: { total, page: p, limit: l } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const scheme = await tenantDb.getRepository(Scheme).findOne({
      where: { id, isDeleted: false },
      relations: [
        'slabs',
        'retailers',
        'retailers.retailer',
        'products',
        'products.product',
        'products.productPricing',
        'productCategories',
        'productCategories.productCategory',
        'retailerChannels',
        'retailerChannels.retailerChannel',
      ],
    });
    if (!scheme) {
      throw new NotFoundException('Scheme not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SCHEME_VIEWED',
      description: `Scheme ${scheme.name} viewed`,
      metadata: { schemeId: scheme.id },
    });

    return scheme;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateSchemeDto, user: any) {
    const repo = tenantDb.getRepository(Scheme);
    const scheme = await repo.findOne({ where: { id, isDeleted: false } });
    if (!scheme) {
      throw new NotFoundException('Scheme not found');
    }

    const nextName = dto.name !== undefined ? dto.name.trim() : scheme.name;
    await this.ensureNameUnique(tenantDb, nextName, scheme.id);

    if (dto.retailerIds !== undefined) {
      await this.ensureIdsExist(
        tenantDb,
        this.toUniqueIds(dto.retailerIds),
        Retailer,
        'retailers',
      );
    }
    if (dto.schemeProducts !== undefined) {
      await this.ensureSchemeProductsValid(
        tenantDb,
        this.normalizeSchemeProducts(dto.schemeProducts),
      );
    }
    if (dto.productCategoryIds !== undefined) {
      await this.ensureIdsExist(
        tenantDb,
        this.toUniqueIds(dto.productCategoryIds),
        ProductCategory,
        'product categories',
      );
    }
    if (dto.retailerChannelIds !== undefined) {
      await this.ensureIdsExist(
        tenantDb,
        this.toUniqueIds(dto.retailerChannelIds),
        RetailerChannel,
        'retailer channels',
      );
    }

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const nextStart = new Date(dto.startDate ?? scheme.startDate);
      const nextEnd = new Date(dto.endDate ?? scheme.endDate);
      this.validateDateRange(nextStart, nextEnd);
    }

    await tenantDb.transaction(async (manager) => {
      if (dto.name !== undefined) {
        scheme.name = nextName;
      }
      if (dto.schemeType !== undefined) {
        scheme.schemeType = dto.schemeType;
      }
      if (dto.benefitType !== undefined) {
        scheme.benefitType = dto.benefitType;
      }
      if (dto.startDate !== undefined) {
        scheme.startDate = new Date(dto.startDate);
      }
      if (dto.endDate !== undefined) {
        scheme.endDate = new Date(dto.endDate);
      }
      if (dto.isActive !== undefined) {
        scheme.isActive = dto.isActive;
      }
      await manager.getRepository(Scheme).save(scheme);

      if (dto.slabs !== undefined) {
        await manager.getRepository(SchemeSlab).delete({ scheme: { id: scheme.id } });
      }
      if (dto.retailerIds !== undefined) {
        await manager.getRepository(SchemeRetailer).delete({ scheme: { id: scheme.id } });
      }
      if (dto.schemeProducts !== undefined) {
        await manager.getRepository(SchemeProduct).delete({ scheme: { id: scheme.id } });
      }
      if (dto.productCategoryIds !== undefined) {
        await manager
          .getRepository(SchemeProductCategory)
          .delete({ scheme: { id: scheme.id } });
      }
      if (dto.retailerChannelIds !== undefined) {
        await manager
          .getRepository(SchemeRetailerChannel)
          .delete({ scheme: { id: scheme.id } });
      }

      await this.createRelations(manager, scheme.id, dto);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SCHEME_UPDATED',
      description: `Scheme ${scheme.name} updated`,
      metadata: { schemeId: scheme.id },
    });

    return this.view(tenantDb, scheme.id, user);
  }

  async delete(tenantDb: DataSource, id: string, user: any) {
    const repo = tenantDb.getRepository(Scheme);
    const scheme = await repo.findOne({ where: { id, isDeleted: false } });
    if (!scheme) {
      throw new NotFoundException('Scheme not found');
    }
    scheme.isDeleted = true;
    scheme.isActive = false;
    await repo.save(scheme);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SCHEME_DELETED',
      description: `Scheme ${scheme.name} deleted`,
      metadata: { schemeId: scheme.id },
    });

    return { message: 'Scheme deleted successfully' };
  }

  async updateStatus(tenantDb: DataSource, id: string, status: boolean, user: any) {
    const repo = tenantDb.getRepository(Scheme);
    const scheme = await repo.findOne({ where: { id, isDeleted: false } });
    if (!scheme) {
      throw new NotFoundException('Scheme not found');
    }
    scheme.isActive = status;
    await repo.save(scheme);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SCHEME_STATUS_UPDATED',
      description: `Scheme ${scheme.name} status updated to ${status}`,
      metadata: { schemeId: scheme.id, status },
    });

    return {
      message: 'Scheme status updated successfully',
      scheme: {
        id: scheme.id,
        name: scheme.name,
        status: scheme.isActive,
      },
    };
  }
}
