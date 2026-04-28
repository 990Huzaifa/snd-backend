import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { ProductBrand } from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateProductBrandDto } from '../dto/product-brand/create-product-brand.dto';
import { UpdateProductBrandDto } from '../dto/product-brand/update-product-brand.dto';

@Injectable()
export class ProductBrandService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async create(tenantDb: DataSource, dto: CreateProductBrandDto, user: any) {
    const name = dto.name.trim();
    const existingBrand = await tenantDb.getRepository(ProductBrand).findOne({
      where: { name },
    });

    if (existingBrand) {
      throw new ConflictException('Product brand with this name already exists');
    }

    const brand = tenantDb.getRepository(ProductBrand).create({ name });
    const createdBrand = await tenantDb.getRepository(ProductBrand).save(brand);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_BRAND_CREATED',
      description: `Product brand ${createdBrand.name} created`,
      metadata: { productBrandId: createdBrand.id },
    });

    return createdBrand;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [brands, total] = await tenantDb.getRepository(ProductBrand).findAndCount({
      where: { name: Like(`%${search}%`) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_BRAND_LISTED',
      description: 'Product brands listed',
      metadata: { total, page, limit },
    });

    return { result: brands, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const brand = await tenantDb.getRepository(ProductBrand).findOne({
      where: { id },
    });

    if (!brand) {
      throw new NotFoundException('Product brand not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_BRAND_VIEWED',
      description: `Product brand ${brand.name} viewed`,
      metadata: { productBrandId: brand.id },
    });

    return brand;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateProductBrandDto, user: any) {
    const brandRepo = tenantDb.getRepository(ProductBrand);
    const brand = await brandRepo.findOne({ where: { id } });

    if (!brand) {
      throw new NotFoundException('Product brand not found');
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (nextName !== brand.name) {
        const nameTaken = await brandRepo.findOne({ where: { name: nextName } });
        if (nameTaken) {
          throw new ConflictException('Product brand with this name already exists');
        }
        brand.name = nextName;
      }
    }

    await brandRepo.save(brand);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_BRAND_UPDATED',
      description: `Product brand ${brand.name} updated`,
      metadata: { productBrandId: brand.id },
    });

    return brand;
  }
}
