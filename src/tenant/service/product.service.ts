import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, In } from 'typeorm';
import {
  Flavour,
  Product,
  ProductBrand,
  ProductCategory,
  ProductFlavour,
  ProductPricing,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { CreateProductDto } from '../dto/product/create-product.dto';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class ProductService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private parseCsvIds(value?: string): string[] {
    if (!value?.trim()) {
      return [];
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async ensureCategoryExists(tenantDb: DataSource, categoryId: string) {
    const category = await tenantDb.getRepository(ProductCategory).findOne({
      where: { id: categoryId },
      select: ['id'],
    });
    if (!category) {
      throw new NotFoundException('Product category not found');
    }
  }

  private async ensureBrandExists(tenantDb: DataSource, brandId: string) {
    const brand = await tenantDb.getRepository(ProductBrand).findOne({
      where: { id: brandId },
      select: ['id'],
    });
    if (!brand) {
      throw new NotFoundException('Product brand not found');
    }
  }

  private async ensureSkuUnique(
    tenantDb: DataSource,
    skuCode: string,
    excludeProductId?: string,
  ) {
    const qb = tenantDb
      .getRepository(Product)
      .createQueryBuilder('product')
      .where('product.skuCode = :skuCode', { skuCode })
      .andWhere('product.isDelete = :isDelete', { isDelete: false });

    if (excludeProductId) {
      qb.andWhere('product.id != :excludeProductId', { excludeProductId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException('Product with this SKU already exists');
    }
  }

  private async ensureFlavoursExist(tenantDb: DataSource, flavourIds: string[]) {
    const uniqueFlavourIds = [...new Set(flavourIds)];
    const count = await tenantDb.getRepository(Flavour).count({
      where: { id: In(uniqueFlavourIds) },
    });

    if (count !== uniqueFlavourIds.length) {
      throw new NotFoundException('One or more flavours not found');
    }
  }

  private async ensureUomsExist(tenantDb: DataSource, uomIds: string[]) {
    const uniqueUomIds = [...new Set(uomIds)];
    const count = await tenantDb.getRepository(Uom).count({
      where: { id: In(uniqueUomIds) },
    });

    if (count !== uniqueUomIds.length) {
      throw new NotFoundException('One or more UOMs not found');
    }
  }

  async create(tenantDb: DataSource, dto: CreateProductDto, user: any) {
    const categoryId = dto.categoryId.trim();
    const brandId = dto.brandId?.trim();
    const skuCode = dto.skuCode.trim();
    const name = dto.name.trim();
    const description = dto.description?.trim() || null;
    const image = dto.image?.trim() || null;
    const flavourIds = dto.flavourIds.map((id) => id.trim()).filter(Boolean);

    await this.ensureCategoryExists(tenantDb, categoryId);
    if (brandId) {
      await this.ensureBrandExists(tenantDb, brandId);
    }
    await this.ensureSkuUnique(tenantDb, skuCode);
    await this.ensureFlavoursExist(tenantDb, flavourIds);
    await this.ensureUomsExist(
      tenantDb,
      dto.pricing.map((item) => item.uomId.trim()),
    );

    const createdProduct = await tenantDb.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const productFlavourRepo = manager.getRepository(ProductFlavour);
      const productPricingRepo = manager.getRepository(ProductPricing);

      const product = productRepo.create({
        categoryId,
        brandId: brandId || null,
        skuCode,
        name,
        description,
        image,
        isActive: dto.isActive ?? true,
      });

      const savedProduct = await productRepo.save(product);

      const flavourRows = [...new Set(flavourIds)].map((flavourId) =>
        productFlavourRepo.create({
          productId: savedProduct.id,
          flavourId,
        }),
      );
      await productFlavourRepo.save(flavourRows);

      const pricingRows = dto.pricing.map((price) =>
        productPricingRepo.create({
          productId: savedProduct.id,
          uomId: price.uomId.trim(),
          tradePrice: price.tradePrice,
          retailPrice: price.retailPrice,
          quantity: price.quantity,
        }),
      );
      await productPricingRepo.save(pricingRows);

      return savedProduct;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CREATED',
      description: `Product ${createdProduct.name} created`,
      metadata: { productId: createdProduct.id, skuCode: createdProduct.skuCode },
    });

    return this.view(tenantDb, createdProduct.id, user);
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    categoryIdsParam: string | undefined,
    brandIdsParam: string | undefined,
    flavourIdsParam: string | undefined,
    user: any,
  ) {
    const categoryIds = this.parseCsvIds(categoryIdsParam);
    const brandIds = this.parseCsvIds(brandIdsParam);
    const flavourIds = this.parseCsvIds(flavourIdsParam);
    const normalizedSearch = search.trim();

    const baseQb = tenantDb
      .getRepository(Product)
      .createQueryBuilder('product')
      .leftJoin('product.category', 'category')
      .leftJoin('product.brand', 'brand')
      .leftJoin('product.flavours', 'productFlavour')
      .where('product.isDelete = :isDelete', { isDelete: false });

    if (normalizedSearch) {
      baseQb.andWhere(
        new Brackets((subQuery) => {
          subQuery.where('product.name LIKE :search', {
            search: `%${normalizedSearch}%`,
          });
        }),
      );
    }

    if (categoryIds.length) {
      baseQb.andWhere('category.id IN (:...categoryIds)', { categoryIds });
    }

    if (brandIds.length) {
      baseQb.andWhere('brand.id IN (:...brandIds)', { brandIds });
    }

    if (flavourIds.length) {
      baseQb.andWhere('productFlavour.flavourId IN (:...flavourIds)', {
        flavourIds,
      });
    }

    const total = await baseQb
      .clone()
      .select('product.id')
      .distinct(true)
      .getCount();

    const rows = await baseQb
      .clone()
      .select('product.id', 'id')
      .distinct(true)
      .orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<{ id: string }>();

    const productIds = rows.map((row) => row.id);
    const products = productIds.length
      ? await tenantDb.getRepository(Product).find({
          where: { id: In(productIds), isDelete: false },
          relations: [
            'category',
            'brand',
            'flavours',
            'flavours.flavour',
            'pricing',
            'pricing.uom',
          ],
        })
      : [];

    const productMap = new Map(products.map((product) => [product.id, product]));
    const orderedProducts = productIds
      .map((id) => productMap.get(id))
      .filter((product): product is Product => Boolean(product));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_LISTED',
      description: 'Products listed',
      metadata: {
        total,
        page,
        limit,
        categoryIds,
        brandIds,
        flavourIds,
      },
    });

    return { result: orderedProducts, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const product = await tenantDb.getRepository(Product).findOne({
      where: { id, isDelete: false },
      relations: [
        'category',
        'brand',
        'flavours',
        'flavours.flavour',
        'pricing',
        'pricing.uom',
      ],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_VIEWED',
      description: `Product ${product.name} viewed`,
      metadata: { productId: product.id },
    });

    return product;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateProductDto, user: any) {
    const productRepo = tenantDb.getRepository(Product);
    const product = await productRepo.findOne({
      where: { id, isDelete: false },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.categoryId !== undefined) {
      await this.ensureCategoryExists(tenantDb, dto.categoryId.trim());
      product.categoryId = dto.categoryId.trim();
    }

    if (dto.brandId !== undefined) {
      const nextBrandId = dto.brandId?.trim();
      if (nextBrandId) {
        await this.ensureBrandExists(tenantDb, nextBrandId);
        product.brandId = nextBrandId;
      } else {
        product.brandId = null;
      }
    }

    if (dto.skuCode !== undefined) {
      const skuCode = dto.skuCode.trim();
      await this.ensureSkuUnique(tenantDb, skuCode, id);
      product.skuCode = skuCode;
    }

    if (dto.name !== undefined) {
      product.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      product.description = dto.description?.trim() || null;
    }

    if (dto.image !== undefined) {
      product.image = dto.image?.trim() || null;
    }

    if (dto.isActive !== undefined) {
      product.isActive = dto.isActive;
    }

    if (dto.flavourIds !== undefined) {
      const flavourIds = dto.flavourIds.map((item) => item.trim()).filter(Boolean);
      if (flavourIds.length) {
        await this.ensureFlavoursExist(tenantDb, flavourIds);
      }
      await tenantDb.getRepository(ProductFlavour).delete({ productId: product.id });
      if (flavourIds.length) {
        const rows = [...new Set(flavourIds)].map((flavourId) =>
          tenantDb.getRepository(ProductFlavour).create({
            productId: product.id,
            flavourId,
          }),
        );
        await tenantDb.getRepository(ProductFlavour).save(rows);
      }
    }

    if (dto.pricing !== undefined) {
      if (dto.pricing.length) {
        await this.ensureUomsExist(
          tenantDb,
          dto.pricing.map((item) => item.uomId.trim()),
        );
      }
      await tenantDb.getRepository(ProductPricing).delete({ productId: product.id });
      if (dto.pricing.length) {
        const rows = dto.pricing.map((item) =>
          tenantDb.getRepository(ProductPricing).create({
            productId: product.id,
            uomId: item.uomId.trim(),
            tradePrice: item.tradePrice,
            retailPrice: item.retailPrice,
            quantity: item.quantity,
          }),
        );
        await tenantDb.getRepository(ProductPricing).save(rows);
      }
    }

    await productRepo.save(product);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_UPDATED',
      description: `Product ${product.name} updated`,
      metadata: { productId: product.id, skuCode: product.skuCode },
    });

    return this.view(tenantDb, id, user);
  }
}
