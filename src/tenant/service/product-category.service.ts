import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { ProductCategory } from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateProductCategoryDto } from '../dto/product-category/create-product-category.dto';
import { UpdateProductCategoryDto } from '../dto/product-category/update-product-category.dto';

@Injectable()
export class ProductCategoryService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async create(
    tenantDb: DataSource,
    dto: CreateProductCategoryDto,
    user: any,
  ) {
    const slug = dto.slug.trim().toLowerCase();
    const existingCategory = await tenantDb.getRepository(ProductCategory).findOne({
      where: { slug },
    });

    if (existingCategory) {
      throw new ConflictException('Product category with this slug already exists');
    }

    const category = tenantDb.getRepository(ProductCategory).create({
      name: dto.name.trim(),
      slug,
      createdBy: user.userId,
    });

    const createdCategory = await tenantDb.getRepository(ProductCategory).save(category);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CATEGORY_CREATED',
      description: `Product category ${createdCategory.name} created`,
      metadata: { productCategoryId: createdCategory.id, slug: createdCategory.slug },
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
    const [categories, total] = await tenantDb.getRepository(ProductCategory).findAndCount({
      where: [
        { name: Like(`%${search}%`) },
        { slug: Like(`%${search}%`) },
      ],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CATEGORY_LISTED',
      description: 'Product categories listed',
      metadata: { total, page, limit },
    });

    return { result: categories, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const category = await tenantDb.getRepository(ProductCategory).findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Product category not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CATEGORY_VIEWED',
      description: `Product category ${category.name} viewed`,
      metadata: { productCategoryId: category.id },
    });

    return category;
  }

  async edit(
    tenantDb: DataSource,
    id: string,
    dto: UpdateProductCategoryDto,
    user: any,
  ) {
    const categoryRepo = tenantDb.getRepository(ProductCategory);
    const category = await categoryRepo.findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Product category not found');
    }

    if (dto.slug !== undefined) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== category.slug) {
        const slugTaken = await categoryRepo.findOne({ where: { slug: nextSlug } });
        if (slugTaken) {
          throw new ConflictException('Product category with this slug already exists');
        }
        category.slug = nextSlug;
      }
    }

    if (dto.name !== undefined) {
      category.name = dto.name.trim();
    }

    await categoryRepo.save(category);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CATEGORY_UPDATED',
      description: `Product category ${category.name} updated`,
      metadata: { productCategoryId: category.id, slug: category.slug },
    });

    return category;
  }
}
