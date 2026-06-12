import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProductPricing } from 'src/tenant-db/entities/product.entity';
import {
  ReferenceType,
  StockBalance,
  StockMovement,
  StockMovementType,
} from 'src/tenant-db/entities/stock.entity';

type StockLineInput = {
  productId: string;
  productFlavourId: string;
  productPricingId: string;
  quantity: number;
};

type ApplyStockMovementInput = StockLineInput & {
  distributorId: string;
  type: StockMovementType;
  referenceType: ReferenceType;
};

type StockBatchInput = {
  distributorId: string;
  items: StockLineInput[];
};

type FulfillReservedStockInput = StockBatchInput & {
  referenceType: ReferenceType;
};

@Injectable()
export class StockService {
  private async resolveUomId(
    manager: EntityManager,
    productPricingId: string,
    cache: Map<string, string>,
  ): Promise<string> {
    const cached = cache.get(productPricingId);
    if (cached) {
      return cached;
    }

    const pricing = await manager.getRepository(ProductPricing).findOne({
      where: { id: productPricingId },
      select: ['id', 'uomId'],
    });
    if (!pricing) {
      throw new NotFoundException(`Product pricing ${productPricingId} not found`);
    }

    cache.set(productPricingId, pricing.uomId);
    return pricing.uomId;
  }

  private async findOrCreateBalance(
    manager: EntityManager,
    input: {
      distributorId: string;
      productId: string;
      productFlavourId: string;
      uomId: string;
    },
  ): Promise<StockBalance> {
    const balanceRepo = manager.getRepository(StockBalance);
    const existing = await balanceRepo.findOne({
      where: {
        distributorId: input.distributorId,
        productId: input.productId,
        productFlavourId: input.productFlavourId,
        uomId: input.uomId,
      },
    });

    if (existing) {
      return existing;
    }

    return balanceRepo.save(
      balanceRepo.create({
        distributorId: input.distributorId,
        productId: input.productId,
        productFlavourId: input.productFlavourId,
        uomId: input.uomId,
        quantityAvailable: 0,
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityDamaged: 0,
      }),
    );
  }

  private async recordMovement(
    manager: EntityManager,
    input: {
      distributorId: string;
      productId: string;
      productFlavourId: string;
      uomId: string;
      quantity: number;
      type: StockMovementType;
      referenceType: ReferenceType;
    },
  ) {
    const movementRepo = manager.getRepository(StockMovement);
    await movementRepo.save(
      movementRepo.create({
        distributorId: input.distributorId,
        productId: input.productId,
        productFlavourId: input.productFlavourId,
        uomId: input.uomId,
        quantity: input.quantity,
        type: input.type,
        referenceType: input.referenceType,
      }),
    );
  }

  async applyStockMovement(manager: EntityManager, input: ApplyStockMovementInput) {
    const uomCache = new Map<string, string>();
    const uomId = await this.resolveUomId(manager, input.productPricingId, uomCache);
    const balanceRepo = manager.getRepository(StockBalance);
    const balance = await this.findOrCreateBalance(manager, {
      distributorId: input.distributorId,
      productId: input.productId,
      productFlavourId: input.productFlavourId,
      uomId,
    });

    if (input.type === StockMovementType.IN) {
      balance.quantityAvailable += input.quantity;
      balance.quantityOnHand += input.quantity;
    } else {
      if (balance.quantityAvailable < input.quantity) {
        throw new BadRequestException('Insufficient available stock');
      }
      balance.quantityAvailable -= input.quantity;
      balance.quantityOnHand -= input.quantity;
    }

    await balanceRepo.save(balance);
    await this.recordMovement(manager, {
      distributorId: input.distributorId,
      productId: input.productId,
      productFlavourId: input.productFlavourId,
      uomId,
      quantity: input.quantity,
      type: input.type,
      referenceType: input.referenceType,
    });

    return balance;
  }

  async reserveStock(manager: EntityManager, input: StockBatchInput) {
    const uomCache = new Map<string, string>();
    const balanceRepo = manager.getRepository(StockBalance);

    for (const item of input.items) {
      const uomId = await this.resolveUomId(manager, item.productPricingId, uomCache);
      const balance = await this.findOrCreateBalance(manager, {
        distributorId: input.distributorId,
        productId: item.productId,
        productFlavourId: item.productFlavourId,
        uomId,
      });

      if (balance.quantityAvailable < item.quantity) {
        throw new BadRequestException('Insufficient available stock to reserve');
      }

      balance.quantityReserved += item.quantity;
      balance.quantityAvailable -= item.quantity;
      await balanceRepo.save(balance);
    }
  }

  async releaseStock(manager: EntityManager, input: StockBatchInput) {
    const uomCache = new Map<string, string>();
    const balanceRepo = manager.getRepository(StockBalance);

    for (const item of input.items) {
      const uomId = await this.resolveUomId(manager, item.productPricingId, uomCache);
      const balance = await balanceRepo.findOne({
        where: {
          distributorId: input.distributorId,
          productId: item.productId,
          productFlavourId: item.productFlavourId,
          uomId,
        },
      });

      if (!balance) {
        throw new BadRequestException('No stock balance found to release reservation');
      }

      if (balance.quantityReserved < item.quantity) {
        throw new BadRequestException('Insufficient reserved stock to release');
      }

      balance.quantityReserved -= item.quantity;
      balance.quantityAvailable += item.quantity;
      await balanceRepo.save(balance);
    }
  }

  async fulfillReservedStock(manager: EntityManager, input: FulfillReservedStockInput) {
    const uomCache = new Map<string, string>();
    const balanceRepo = manager.getRepository(StockBalance);

    for (const item of input.items) {
      const uomId = await this.resolveUomId(manager, item.productPricingId, uomCache);
      const balance = await balanceRepo.findOne({
        where: {
          distributorId: input.distributorId,
          productId: item.productId,
          productFlavourId: item.productFlavourId,
          uomId,
        },
      });

      if (!balance) {
        throw new BadRequestException('No stock balance found to fulfill');
      }

      if (balance.quantityReserved < item.quantity) {
        throw new BadRequestException('Insufficient reserved stock to fulfill');
      }

      balance.quantityReserved -= item.quantity;
      balance.quantityOnHand -= item.quantity;
      await balanceRepo.save(balance);

      await this.recordMovement(manager, {
        distributorId: input.distributorId,
        productId: item.productId,
        productFlavourId: item.productFlavourId,
        uomId,
        quantity: item.quantity,
        type: StockMovementType.OUT,
        referenceType: input.referenceType,
      });
    }
  }

  async applyOrderStockMovement(
    manager: EntityManager,
    input: {
      distributorId: string;
      items: StockLineInput[];
      type: StockMovementType;
      referenceType: ReferenceType;
    },
  ) {
    for (const item of input.items) {
      await this.applyStockMovement(manager, {
        distributorId: input.distributorId,
        productId: item.productId,
        productFlavourId: item.productFlavourId,
        productPricingId: item.productPricingId,
        quantity: item.quantity,
        type: input.type,
        referenceType: input.referenceType,
      });
    }
  }
}
