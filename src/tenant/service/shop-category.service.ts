import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { RetailerCategory } from 'src/tenant-db/entities/retailer.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateShopCategoryDto } from '../dto/shop-category/create-shop-category.dto';
import { UpdateShopCategoryDto } from '../dto/shop-category/update-shop-category.dto';

@Injectable()
export class ShopCategoryService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private normalize(value: string): string {
    return value.trim();
  }

  async create(tenantDb: DataSource, dto: CreateShopCategoryDto, user: any) {
    const name = this.normalize(dto.name);

    const existing = await tenantDb.getRepository(RetailerCategory).findOne({
      where: { name },
    });
    if (existing) {
      throw new ConflictException('Shop category with this name already exists');
    }

    const category = tenantDb.getRepository(RetailerCategory).create({ name });
    const createdCategory = await tenantDb.getRepository(RetailerCategory).save(category);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CATEGORY_CREATED',
      description: `Shop category ${createdCategory.name} created`,
      metadata: { shopCategoryId: createdCategory.id },
    });

    return createdCategory;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [categories, total] = await tenantDb.getRepository(RetailerCategory).findAndCount({
      where: { name: Like(`%${search}%`) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CATEGORY_LISTED',
      description: 'Shop categories listed',
      metadata: { total, page, limit },
    });

    return { result: categories, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const category = await tenantDb.getRepository(RetailerCategory).findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Shop category not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CATEGORY_VIEWED',
      description: `Shop category ${category.name} viewed`,
      metadata: { shopCategoryId: category.id },
    });

    return category;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateShopCategoryDto, user: any) {
    const repo = tenantDb.getRepository(RetailerCategory);
    const category = await repo.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException('Shop category not found');
    }

    if (dto.name !== undefined) {
      const nextName = this.normalize(dto.name);
      if (nextName !== category.name) {
        const nameTaken = await repo.findOne({ where: { name: nextName } });
        if (nameTaken) {
          throw new ConflictException('Shop category with this name already exists');
        }
        category.name = nextName;
      }
    }

    const updated = await repo.save(category);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CATEGORY_UPDATED',
      description: `Shop category ${updated.name} updated`,
      metadata: { shopCategoryId: updated.id },
    });

    return updated;
  }
}
