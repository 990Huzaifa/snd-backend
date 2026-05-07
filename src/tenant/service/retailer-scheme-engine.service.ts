import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Retailer } from 'src/tenant-db/entities/retailer.entity';
import { SaleOrder, SaleOrderItem } from 'src/tenant-db/entities/saleorder.entity';
import { BenefitType, Scheme, SchemeSlab, SchemeType } from 'src/tenant-db/entities/scheme.entity';

export interface RetailerSchemeResult {
  schemeId: string;
  schemeName: string;
  schemeType: SchemeType;
  retailerId: string;
  eligibleAmount: number;
  matchedSlabId: string;
  benefitType: BenefitType;
  benefitValue: string;
  calculatedBenefitAmount: number;
  status: 'CALCULATED';
}

export interface RetailerSchemeListResult {
  schemeId: string;
  schemeName: string;
  schemeType: SchemeType;
  benefitType: BenefitType;
  retailerId: string;
  retailerChannelId: string;
  eligibleAmount: number;
  matchedSlabId: string;
  benefitValue: string;
  calculatedBenefitAmount: number;
  slabs: SchemeSlab[];
}

@Injectable()
export class RetailerSchemeEngineService {
  async listEligibleSchemesForRetailer(
    tenantDb: DataSource,
    input: { retailerId: string; orderDate: Date; orderTotal: number },
  ): Promise<RetailerSchemeListResult[]> {
    const orderDate = new Date(input.orderDate);
    if (Number.isNaN(orderDate.getTime())) {
      throw new BadRequestException('Invalid orderDate');
    }

    const eligibleAmount = Number(input.orderTotal ?? 0);
    if (!Number.isFinite(eligibleAmount) || eligibleAmount <= 0) {
      return [];
    }

    const retailer = await tenantDb.getRepository(Retailer).findOne({
      where: { id: input.retailerId },
      select: ['id', 'retailerChannelId'],
    });
    if (!retailer) {
      throw new NotFoundException('Retailer not found');
    }

    const schemes = await this.getActiveRetailerSchemes(tenantDb, orderDate);
    if (!schemes.length) {
      return [];
    }

    const results: RetailerSchemeListResult[] = [];
    for (const scheme of schemes) {
      if (!this.isRetailerEligibleWithChannelPriority(scheme, retailer.id, retailer.retailerChannelId)) {
        continue;
      }

      const matchedSlab = this.matchHighestAmountSlab(scheme.slabs, eligibleAmount);
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
        retailerId: retailer.id,
        retailerChannelId: retailer.retailerChannelId,
        eligibleAmount,
        matchedSlabId: matchedSlab.id,
        benefitValue: matchedSlab.benefitValue,
        calculatedBenefitAmount,
        slabs: scheme.slabs ?? [],
      });
    }

    return results;
  }

  async calculateRetailerEligibleSchemes(
    tenantDb: DataSource,
    order: SaleOrder,
  ): Promise<RetailerSchemeResult[]> {
    const enrichedOrder = await this.ensureOrderWithRelations(tenantDb, order);
    // this.assertSubmittedOrder(enrichedOrder);

    const schemes = await this.getActiveRetailerSchemes(tenantDb, enrichedOrder.orderDate);
    if (!schemes.length) {
      return [];
    }

    const retailer = await tenantDb.getRepository(Retailer).findOne({
      where: { id: enrichedOrder.retailerId },
      select: ['id', 'retailerChannelId'],
    });
    if (!retailer) {
      throw new NotFoundException('Retailer not found for order');
    }

    const eligibleAmount = this.calculateEligibleOrderAmount(enrichedOrder.items);
    if (eligibleAmount <= 0) {
      return [];
    }

    const results: RetailerSchemeResult[] = [];
    for (const scheme of schemes) {
      if (!this.isRetailerEligibleWithChannelPriority(scheme, retailer.id, retailer.retailerChannelId)) {
        continue;
      }

      const matchedSlab = this.matchHighestAmountSlab(scheme.slabs, eligibleAmount);
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
        retailerId: retailer.id,
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

  async getActiveRetailerSchemes(tenantDb: DataSource, orderDate: Date): Promise<Scheme[]> {
    return tenantDb.getRepository(Scheme).find({
      where: {
        isActive: true,
        isDeleted: false,
        schemeType: SchemeType.AMOUNT_BASED,
      },
      relations: [
        'slabs',
        'retailers',
        'retailers.retailer',
        'retailerChannels',
        'retailerChannels.retailerChannel',
      ],
    }).then((schemes) =>
      schemes.filter(
        (scheme) =>
          scheme.startDate <= orderDate &&
          scheme.endDate >= orderDate,
      ),
    );
  }

  checkRetailerEligibility(scheme: Scheme, retailerId: string): boolean {
    const targetedRetailers = scheme.retailers ?? [];
    if (!targetedRetailers.length) {
      return true;
    }

    return targetedRetailers.some(
      (schemeRetailer) => schemeRetailer.retailer?.id === retailerId,
    );
  }

  checkRetailerChannelEligibility(scheme: Scheme, retailerChannelId: string): boolean {
    const targetedChannels = scheme.retailerChannels ?? [];
    if (!targetedChannels.length) {
      return true;
    }

    return targetedChannels.some(
      (schemeChannel) => schemeChannel.retailerChannel?.id === retailerChannelId,
    );
  }

  isRetailerEligibleWithChannelPriority(
    scheme: Scheme,
    retailerId: string,
    retailerChannelId: string,
  ): boolean {
    const targetedChannels = scheme.retailerChannels ?? [];
    const targetedRetailers = scheme.retailers ?? [];

    const hasChannelTargets = targetedChannels.length > 0;
    const hasRetailerTargets = targetedRetailers.length > 0;

    // A retailer scheme must target at least one retailer or channel.
    if (!hasChannelTargets && !hasRetailerTargets) {
      return false;
    }

    if (hasChannelTargets && this.checkRetailerChannelEligibility(scheme, retailerChannelId)) {
      return true;
    }

    if (hasRetailerTargets && this.checkRetailerEligibility(scheme, retailerId)) {
      return true;
    }

    return false;
  }

  calculateEligibleOrderAmount(items: SaleOrderItem[]): number {
    if (!items?.length) {
      return 0;
    }

    return items.reduce((sum, item) => {
      const tradePriceRaw =
        (item as unknown as { tradePrice?: string | number }).tradePrice ??
        item.productPricing?.tradePrice ??
        0;
      const tradePrice = Number(tradePriceRaw);
      const quantity = Number(item.quantity ?? 0);

      if (!Number.isFinite(tradePrice) || !Number.isFinite(quantity)) {
        return sum;
      }

      return sum + tradePrice * quantity;
    }, 0);
  }

  matchHighestAmountSlab(slabs: SchemeSlab[], eligibleAmount: number): SchemeSlab | null {
    if (!slabs?.length) {
      return null;
    }

    const sortedSlabs = [...slabs].sort((a, b) => this.getSlabMinAmount(b) - this.getSlabMinAmount(a));
    return sortedSlabs.find((slab) => eligibleAmount >= this.getSlabMinAmount(slab)) ?? null;
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
    if (order?.items?.length) {
      return order;
    }

    if (!order?.id) {
      throw new BadRequestException('Order id is required to evaluate retailer schemes');
    }

    const foundOrder = await tenantDb.getRepository(SaleOrder).findOne({
      where: { id: order.id },
      relations: ['items', 'items.productPricing'],
    });

    if (!foundOrder) {
      throw new NotFoundException('Order not found');
    }

    return foundOrder;
  }

  private getSlabMinAmount(slab: SchemeSlab): number {
    const slabWithAmount = slab as unknown as { minAmount?: number; minQuantity?: number };
    return Number(slabWithAmount.minAmount ?? slabWithAmount.minQuantity ?? 0);
  }
}
