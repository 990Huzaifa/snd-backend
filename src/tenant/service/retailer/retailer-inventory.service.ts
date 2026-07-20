import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Product,
  ProductFlavour,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import {
  Retailer,
  RetailerInventory,
  RetailerInventoryType,
} from 'src/tenant-db/entities/retailer.entity';
import { SyncRetailerInventoryItemDto } from '../../dto/salesman-app/retailer-inventory/sync-retailer-inventory.dto';

export type RetailerInventoryListItem = {
  id: string;
  retailerId: string;
  productId: string;
  productFlavourId: string;
  uomId: string;
  quantity: number;
  updatedAt: Date;
  retailer: { id: string; shopName: string };
  product: { id: string; name: string; skuCode: string };
  productFlavour: {
    id: string;
    flavour: { id: string; name: string };
  };
  uom: { id: string; name: string };
};

/** Catalog shape for filling retailer inventory sync-up (`productId`, `productFlavourId`, `uomId`). */
export type ActiveProductForInventorySync = {
  id: string;
  name: string;
  skuCode: string;
  image: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  flavours: Array<{
    id: string;
    flavour: { id: string; name: string };
  }>;
  uoms: Array<{ id: string; name: string }>;
};

@Injectable()
export class RetailerInventoryService {
  /**
   * Active products with flavours + UOMs needed to build retailer inventory sync-up rows.
   */
  async listActiveProducts(
    tenantDb: DataSource,
  ): Promise<{ result: ActiveProductForInventorySync[] }> {
    const products = await tenantDb
      .getRepository(Product)
      .createQueryBuilder('product')
      .leftJoin('product.category', 'category')
      .leftJoin('product.brand', 'brand')
      .leftJoin('product.flavours', 'productFlavour')
      .leftJoin('productFlavour.flavour', 'flavour')
      .leftJoin('product.pricing', 'pricing')
      .leftJoin('pricing.uom', 'uom')
      .select([
        'product.id',
        'product.name',
        'product.skuCode',
        'product.image',
        'category.id',
        'category.name',
        'brand.id',
        'brand.name',
        'productFlavour.id',
        'flavour.id',
        'flavour.name',
        'pricing.id',
        'pricing.uomId',
        'uom.id',
        'uom.name',
      ])
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.isDelete = :isDelete', { isDelete: false })
      .orderBy('product.name', 'ASC')
      .addOrderBy('flavour.name', 'ASC')
      .addOrderBy('uom.name', 'ASC')
      .getMany();

    const result: ActiveProductForInventorySync[] = products.map((product) => {
      const uomMap = new Map<string, { id: string; name: string }>();
      for (const pricing of product.pricing ?? []) {
        if (pricing.uom?.id && !uomMap.has(pricing.uom.id)) {
          uomMap.set(pricing.uom.id, {
            id: pricing.uom.id,
            name: pricing.uom.name,
          });
        }
      }

      return {
        id: product.id,
        name: product.name,
        skuCode: product.skuCode,
        image: product.image ?? null,
        category: product.category
          ? { id: product.category.id, name: product.category.name }
          : null,
        brand: product.brand
          ? { id: product.brand.id, name: product.brand.name }
          : null,
        flavours: (product.flavours ?? []).map((pf) => ({
          id: pf.id,
          flavour: {
            id: pf.flavour.id,
            name: pf.flavour.name,
          },
        })),
        uoms: [...uomMap.values()],
      };
    });

    return { result };
  }

  async list(
    tenantDb: DataSource,
    retailerId?: string,
  ): Promise<{ result: RetailerInventoryListItem[] }> {
    const qb = tenantDb
      .getRepository(RetailerInventory)
      .createQueryBuilder('ri')
      .innerJoin('ri.retailer', 'retailer')
      .innerJoin('ri.product', 'product')
      .innerJoin('ri.productFlavour', 'productFlavour')
      .innerJoin('productFlavour.flavour', 'flavour')
      .innerJoin('ri.uom', 'uom')
      .select([
        'ri.id',
        'ri.retailerId',
        'ri.productId',
        'ri.productFlavourId',
        'ri.uomId',
        'ri.quantity',
        'ri.updatedAt',
        'retailer.id',
        'retailer.shopName',
        'product.id',
        'product.name',
        'product.skuCode',
        'productFlavour.id',
        'flavour.id',
        'flavour.name',
        'uom.id',
        'uom.name',
      ])
      .orderBy('retailer.shopName', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .addOrderBy('flavour.name', 'ASC')
      .addOrderBy('uom.name', 'ASC');

    if (retailerId?.trim()) {
      qb.andWhere('ri.retailerId = :retailerId', {
        retailerId: retailerId.trim(),
      });
    }

    const rows = await qb.getMany();

    const result: RetailerInventoryListItem[] = rows.map((row) => ({
      id: row.id,
      retailerId: row.retailerId,
      productId: row.productId,
      productFlavourId: row.productFlavourId,
      uomId: row.uomId,
      quantity: row.quantity,
      updatedAt: row.updatedAt,
      retailer: {
        id: row.retailer.id,
        shopName: row.retailer.shopName,
      },
      product: {
        id: row.product.id,
        name: row.product.name,
        skuCode: row.product.skuCode,
      },
      productFlavour: {
        id: row.productFlavour.id,
        flavour: {
          id: row.productFlavour.flavour.id,
          name: row.productFlavour.flavour.name,
        },
      },
      uom: {
        id: row.uom.id,
        name: row.uom.name,
      },
    }));

    return { result };
  }

  async syncItem(
    tenantDb: DataSource,
    item: SyncRetailerInventoryItemDto,
  ): Promise<{
    action: 'created' | 'updated' | 'removed' | 'noop';
    inventoryId?: string;
  }> {
    const type = item.type;
    const retailerId = item.retailerId.trim();
    const productId = item.productId.trim();
    const uomId = item.uomId.trim();
    const productFlavourId = item.productFlavourId;

    await this.assertRefs(tenantDb, {
      retailerId,
      productId,
      productFlavourId,
      uomId,
    });

    const repo = tenantDb.getRepository(RetailerInventory);
    const existing = await repo.findOne({
      where: {
        type,
        retailerId,
        productId,
        productFlavourId,
        uomId,
      },
    });

    if (item.remove === true) {
      if (!existing) {
        return { action: 'noop' };
      }
      await repo.remove(existing);
      return { action: 'removed', inventoryId: existing.id };
    }

    if (item.quantity === undefined || item.quantity === null) {
      throw new BadRequestException('quantity is required when remove is not true');
    }

    if (existing) {
      existing.quantity = item.quantity;
      const saved = await repo.save(existing);
      return { action: 'updated', inventoryId: saved.id };
    }

    const created = await repo.save(
      repo.create({
        type,
        retailerId,
        productId,
        productFlavourId,
        uomId,
        quantity: item.quantity,
      }),
    );

    return { action: 'created', inventoryId: created.id };
  }

  private async assertRefs(
    tenantDb: DataSource,
    refs: {
      retailerId: string;
      productId: string;
      productFlavourId: string;
      uomId: string;
    },
  ) {
    const retailer = await tenantDb.getRepository(Retailer).findOne({
      where: { id: refs.retailerId },
      select: ['id'],
    });
    if (!retailer) {
      throw new NotFoundException(`Retailer ${refs.retailerId} not found`);
    }

    const product = await tenantDb.getRepository(Product).findOne({
      where: { id: refs.productId },
      select: ['id'],
    });
    if (!product) {
      throw new NotFoundException(`Product ${refs.productId} not found`);
    }

    const productFlavour = await tenantDb.getRepository(ProductFlavour).findOne({
      where: { id: refs.productFlavourId },
      select: ['id', 'productId'],
    });
    if (!productFlavour) {
      throw new NotFoundException(
        `Product flavour ${refs.productFlavourId} not found`,
      );
    }
    if (productFlavour.productId !== refs.productId) {
      throw new BadRequestException(
        `Product flavour ${refs.productFlavourId} does not belong to product ${refs.productId}`,
      );
    }

    const uom = await tenantDb.getRepository(Uom).findOne({
      where: { id: refs.uomId },
      select: ['id'],
    });
    if (!uom) {
      throw new NotFoundException(`UOM ${refs.uomId} not found`);
    }
  }
}
