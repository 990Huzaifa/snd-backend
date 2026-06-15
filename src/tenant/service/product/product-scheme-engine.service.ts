import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SaleOrder, SaleOrderItem } from 'src/tenant-db/entities/saleorder.entity';
import { BenefitType, Scheme, SchemeSlab, SchemeType } from 'src/tenant-db/entities/scheme.entity';
import { Product, ProductPricing } from 'src/tenant-db/entities/product.entity';

export interface ProductSchemeResult {
  schemeId: string;
  schemeName: string;
  schemeType: SchemeType;
  eligibleQty: number;
  eligibleAmount: number;
  matchedSlabId: string;
  benefitType: BenefitType;
  benefitValue: string;
  calculatedBenefitAmount: number;
  status: 'CALCULATED';
}

export interface ProductSchemeEvaluationInput {
  productId: string;
  productPricingId: string;
  quantity: number;
  orderDate: Date;
}

export interface ProductSchemeListResult {
  schemeId: string;
  schemeName: string;
  schemeType: SchemeType;
  benefitType: BenefitType;
  eligibleQty: number;
  eligibleAmount: number;
  matchedSlabId: string;
  benefitValue: string;
  calculatedBenefitAmount: number;
  slabs: SchemeSlab[];
}

@Injectable()
export class ProductSchemeEngineService {
  async listEligibleSchemesForProduct(
    tenantDb: DataSource,
    input: ProductSchemeEvaluationInput,
  ): Promise<ProductSchemeListResult[]> {
    const orderDate = new Date(input.orderDate);
    if (Number.isNaN(orderDate.getTime())) {
      throw new BadRequestException('Invalid orderDate');
    }

    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    const [product, pricing] = await Promise.all([
      tenantDb.getRepository(Product).findOne({
        where: { id: input.productId, isDelete: false, isActive: true },
        select: ['id', 'categoryId'],
      }),
      tenantDb.getRepository(ProductPricing).findOne({
        where: { id: input.productPricingId, productId: input.productId },
        select: ['id', 'productId', 'tradePrice'],
      }),
    ]);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!pricing) {
      throw new NotFoundException('Product pricing not found for this product');
    }

    const schemes = await this.getActiveProductSchemes(tenantDb, orderDate);
    if (!schemes.length) {
      return [];
    }

    const eligibleAmount = Number(pricing.tradePrice ?? 0) * quantity;
    const results: ProductSchemeListResult[] = [];

    for (const scheme of schemes) {
      if (!this.isSchemeApplicableForProduct(scheme, input.productId, input.productPricingId, product.categoryId)) {
        continue;
      }

      const matchedSlab = this.matchHighestSlab(scheme.schemeType, scheme.slabs, {
        eligibleQty: quantity,
        eligibleAmount,
      });
      if (!matchedSlab) {
        continue;
      }

      const calculatedBenefitAmount = this.calculateBenefit(
        scheme.benefitType,
        matchedSlab.benefitValue,
        eligibleAmount,
      );

      results.push({
        schemeId: scheme.id,
        schemeName: scheme.name,
        schemeType: scheme.schemeType,
        benefitType: scheme.benefitType,
        eligibleQty: quantity,
        eligibleAmount,
        matchedSlabId: matchedSlab.id,
        benefitValue: matchedSlab.benefitValue,
        calculatedBenefitAmount,
        slabs: scheme.slabs ?? [],
      });
    }

    return results;
  }

  async calculateProductEligibleSchemes(
    tenantDb: DataSource,
    order: SaleOrder,
  ): Promise<ProductSchemeResult[]> {
    const enrichedOrder = await this.ensureOrderWithRelations(tenantDb, order);
    // this.assertSubmittedOrder(enrichedOrder);

    const schemes = await this.getActiveProductSchemes(tenantDb, enrichedOrder.orderDate);
    if (!schemes.length) {
      return [];
    }

    const results: ProductSchemeResult[] = [];
    for (const scheme of schemes) {
      const eligibleItems = this.getEligibleProductItems(scheme, enrichedOrder.items);
      if (!eligibleItems.length) {
        continue;
      }

      const { eligibleQty, eligibleAmount } = this.calculateEligibleQtyOrAmount(eligibleItems);
      if (eligibleQty <= 0 && eligibleAmount <= 0) {
        continue;
      }

      const matchedSlab = this.matchHighestSlab(scheme.schemeType, scheme.slabs, {
        eligibleQty,
        eligibleAmount,
      });
      if (!matchedSlab) {
        continue;
      }

      const calculatedBenefitAmount = this.calculateBenefit(
        scheme.benefitType,
        matchedSlab.benefitValue,
        eligibleAmount,
      );

      results.push({
        schemeId: scheme.id,
        schemeName: scheme.name,
        schemeType: scheme.schemeType,
        eligibleQty,
        eligibleAmount,
        matchedSlabId: matchedSlab.id,
        benefitType: scheme.benefitType,
        benefitValue: matchedSlab.benefitValue,
        calculatedBenefitAmount,
        status: 'CALCULATED',
      });
    }

    return results;
  }

  private isSchemeApplicableForProduct(
    scheme: Scheme,
    productId: string,
    productPricingId: string,
    categoryId: string,
  ): boolean {
    const targetedCategoryIds = new Set(
      (scheme.productCategories ?? []).map((entry) => entry.productCategory?.id).filter(Boolean),
    );
    if (targetedCategoryIds.size > 0 && !targetedCategoryIds.has(categoryId)) {
      return false;
    }

    const targetedProducts = scheme.products ?? [];
    if (!targetedProducts.length) {
      return targetedCategoryIds.size > 0;
    }

    return targetedProducts.some(
      (entry) => entry.product?.id === productId && entry.productPricing?.id === productPricingId,
    );
  }

  async getActiveProductSchemes(tenantDb: DataSource, orderDate: Date): Promise<Scheme[]> {
    return tenantDb
      .getRepository(Scheme)
      .find({
        where: {
          isActive: true,
          isDeleted: false,
        },
        relations: [
          'slabs',
          'products',
          'products.product',
          'products.productPricing',
          'productCategories',
          'productCategories.productCategory',
        ],
      })
      .then((schemes) =>
        schemes.filter((scheme) => {
          const inDateRange = scheme.startDate <= orderDate && scheme.endDate >= orderDate;
          const isSupportedType =
            scheme.schemeType === SchemeType.PIECE_BASED ||
            scheme.schemeType === SchemeType.AMOUNT_BASED;
          const isProductLevel =
            (scheme.products?.length ?? 0) > 0 || (scheme.productCategories?.length ?? 0) > 0;

          return inDateRange && isSupportedType && isProductLevel;
        }),
      );
  }

  getEligibleProductItems(scheme: Scheme, orderItems: SaleOrderItem[]): SaleOrderItem[] {
    const items = orderItems ?? [];
    if (!items.length) {
      return [];
    }

    let eligibleItems = items;

    const targetedCategoryIds = new Set(
      (scheme.productCategories ?? []).map((entry) => entry.productCategory?.id).filter(Boolean),
    );
    if (targetedCategoryIds.size > 0) {
      eligibleItems = eligibleItems.filter((item) => targetedCategoryIds.has(item.product?.categoryId));
      if (!eligibleItems.length) {
        return [];
      }
    }

    const targetedProductIds = new Set(
      (scheme.products ?? []).map((entry) => entry.product?.id).filter(Boolean),
    );
    if (targetedProductIds.size > 0) {
      eligibleItems = eligibleItems.filter((item) => targetedProductIds.has(item.productId));
      if (!eligibleItems.length) {
        return [];
      }
    }

    return eligibleItems;
  }

  calculateEligibleQtyOrAmount(items: SaleOrderItem[]): { eligibleQty: number; eligibleAmount: number } {
    if (!items?.length) {
      return { eligibleQty: 0, eligibleAmount: 0 };
    }

    return items.reduce(
      (acc, item) => {
        const qty = Number(item.quantity ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) {
          return acc;
        }

        const tradePrice = Number(item.productPricing?.tradePrice ?? 0);
        acc.eligibleQty += qty;
        if (Number.isFinite(tradePrice) && tradePrice > 0) {
          acc.eligibleAmount += tradePrice * qty;
        }
        return acc;
      },
      { eligibleQty: 0, eligibleAmount: 0 },
    );
  }

  matchHighestSlab(
    schemeType: SchemeType,
    slabs: SchemeSlab[],
    eligibility: { eligibleQty: number; eligibleAmount: number },
  ): SchemeSlab | null {
    if (!slabs?.length) {
      return null;
    }

    if (schemeType === SchemeType.PIECE_BASED) {
      const sorted = [...slabs].sort((a, b) => this.getSlabMinQuantity(b) - this.getSlabMinQuantity(a));
      return sorted.find((slab) => eligibility.eligibleQty >= this.getSlabMinQuantity(slab)) ?? null;
    }

    const sorted = [...slabs].sort((a, b) => this.getSlabMinAmount(b) - this.getSlabMinAmount(a));
    return sorted.find((slab) => eligibility.eligibleAmount >= this.getSlabMinAmount(slab)) ?? null;
  }

  calculateBenefit(benefitType: BenefitType, benefitValue: string, eligibleAmount: number): number {
    const parsedBenefitValue = Number(benefitValue);
    if (!Number.isFinite(parsedBenefitValue) || parsedBenefitValue <= 0) {
      return 0;
    }

    if (benefitType === BenefitType.DISCOUNT_PERCENTAGE) {
      return (eligibleAmount * parsedBenefitValue) / 100;
    }

    if (benefitType === BenefitType.DISCOUNT_AMOUNT) {
      return parsedBenefitValue;
    }

    return 0;
  }

  private async ensureOrderWithRelations(tenantDb: DataSource, order: SaleOrder): Promise<SaleOrder> {
    const hasItems = !!order?.items?.length;
    const hasItemRelations =
      hasItems &&
      order.items.every((item) => !!item.product && !!item.productPricing);

    if (hasItems && hasItemRelations) {
      return order;
    }

    if (!order?.id) {
      throw new BadRequestException('Order id is required to evaluate product schemes');
    }

    const foundOrder = await tenantDb.getRepository(SaleOrder).findOne({
      where: { id: order.id },
      relations: ['items', 'items.product', 'items.productPricing'],
    });

    if (!foundOrder) {
      throw new NotFoundException('Order not found');
    }

    return foundOrder;
  }

  private assertSubmittedOrder(order: SaleOrder): void {
    if ((order.orderStatus as unknown as string) === 'SUBMITTED') {
      return;
    }

    throw new BadRequestException('Only submitted orders are eligible for product schemes');
  }

  private getSlabMinQuantity(slab: SchemeSlab): number {
    return Number((slab as unknown as { minQuantity?: number }).minQuantity ?? 0);
  }

  private getSlabMinAmount(slab: SchemeSlab): number {
    const slabWithAmount = slab as unknown as { minAmount?: number; minQuantity?: number };
    return Number(slabWithAmount.minAmount ?? slabWithAmount.minQuantity ?? 0);
  }
}
