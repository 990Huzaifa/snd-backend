import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { ProductPricing } from 'src/tenant-db/entities/product.entity';
import { PJP, PJPRoute, PJPStatus } from 'src/tenant-db/entities/pjp.entity';
import { Retailer, RetailerCategory, RetailerChannel } from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { Scheme } from 'src/tenant-db/entities/scheme.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import {
  SaleVoucher,
  SaleVoucherStatus,
} from 'src/tenant-db/entities/sale-voucher.entity';
import { SalesmanDistributor } from 'src/tenant-db/entities/user.entity';
import { StockBalance } from 'src/tenant-db/entities/stock.entity';

const SCHEME_RELATIONS = [
  'slabs',
  'retailers',
  'retailers.retailer',
  'products',
  'products.product',
  'products.productPricing',
  'products.productPricing.uom',
  'productCategories',
  'productCategories.productCategory',
  'retailerChannels',
  'retailerChannels.retailerChannel',
] as const;

const RETAILER_RELATIONS = [
  'createdByUser',
  'approvedByUser',
  'retailerCategory',
  'retailerChannel',
  'route',
  'route.area',
  'route.area.region',
  'route.distributor',
  'route.distributor.area',
  'route.distributor.area.region',
] as const;

const ROUTE_RELATIONS = ['area', 'area.region', 'distributor'] as const;

const SALE_VOUCHER_RELATIONS = [
  'retailer',
  'retailer.route',
  'retailer.retailerCategory',
  'retailer.retailerChannel',
  'createdByUser',
  'executedByUser',
] as const;

const SALE_INVOICE_RELATIONS = [
  'distributor',
  'salesman',
  'retailer',
  'route',
  'route.area',
  'scheme',
  'schemeSlab',
  'saleOrder',
  'executedByUser',
  'items',
  'items.product',
  'items.productFlavour',
  'items.productFlavour.flavour',
  'items.productPricing',
  'items.productPricing.uom',
  'items.scheme',
  'items.slab',
] as const;

@Injectable()
export class SalesmanSyncDownService {

  private normalizeDistributorId(distributorId?: string): string {
    const normalized = (distributorId ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('distributorId is required');
    }
    return normalized;
  }

  async listStockProducts(tenantDb: DataSource, distributorId: string) {
    const normalizedDistributorId = this.normalizeDistributorId(distributorId);

    const balances = await tenantDb
      .getRepository(StockBalance)
      .createQueryBuilder('sb')
      .innerJoinAndSelect('sb.distributor', 'distributor')
      .innerJoinAndSelect('sb.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.pricing', 'pricing')
      .leftJoinAndSelect('pricing.uom', 'pricingUom')
      .innerJoinAndSelect('sb.productFlavour', 'productFlavour')
      .innerJoinAndSelect('productFlavour.flavour', 'flavour')
      .innerJoinAndSelect('sb.uom', 'uom')
      .where('sb.distributorId = :distributorId', {
        distributorId: normalizedDistributorId,
      })
      .andWhere('product.isDelete = :isDelete', { isDelete: false })
      .andWhere('product.isActive = :isActive', { isActive: true })
      .orderBy('product.name', 'ASC')
      .addOrderBy('flavour.name', 'ASC')
      .addOrderBy('uom.name', 'ASC')
      .getMany();

    if (!balances.length) {
      return { result: [] };
    }

    const productIds = [...new Set(balances.map((balance) => balance.productId))];
    const pricings = await tenantDb.getRepository(ProductPricing).find({
      where: { productId: In(productIds) },
      relations: ['uom'],
    });

    const pricingMap = new Map(
      pricings.map((pricing) => [`${pricing.productId}:${pricing.uomId}`, pricing]),
    );

    const result = balances.map((balance) => ({
      ...balance,
      pricing: pricingMap.get(`${balance.productId}:${balance.uomId}`) ?? null,
    }));

    return { result };
  }

  async listSchemes(tenantDb: DataSource) {
    const schemes = await tenantDb.getRepository(Scheme).find({
      where: { isDeleted: false, isActive: true },
      relations: [...SCHEME_RELATIONS],
      order: { createdAt: 'DESC' },
    });

    return { result: schemes };
  }

  async listRoutes(tenantDb: DataSource, distributorId: string) {
    const normalizedDistributorId = this.normalizeDistributorId(distributorId);

    const routes = await tenantDb.getRepository(Route).find({
      where: { distributorId: normalizedDistributorId },
      relations: [...ROUTE_RELATIONS],
      order: { name: 'ASC' },
    });

    return { result: routes };
  }

  async listRetailers(tenantDb: DataSource) {
    const retailers = await tenantDb.getRepository(Retailer).find({
      relations: [...RETAILER_RELATIONS],
      order: { shopName: 'ASC' },
    });

    return { result: retailers };
  }

  async listPjps(tenantDb: DataSource, user: { userId: string }) {
    const pjps = await tenantDb.getRepository(PJP).find({
      where: { salesmanId: user.userId, status: PJPStatus.ACTIVE },
      relations: ['salesman'],
      order: { weekStartDate: 'DESC' },
    });

    if (!pjps.length) {
      return { result: [] };
    }

    const pjpRoutes = await tenantDb.getRepository(PJPRoute).find({
      where: { pjpId: In(pjps.map((pjp) => pjp.id)) },
      relations: ['route', 'route.area', 'route.distributor', 'route.distributor.area'],
      order: { visitDate: 'ASC' },
    });

    const routesByPjpId = new Map<string, PJPRoute[]>();
    for (const pjpRoute of pjpRoutes) {
      const existing = routesByPjpId.get(pjpRoute.pjpId) ?? [];
      existing.push(pjpRoute);
      routesByPjpId.set(pjpRoute.pjpId, existing);
    }

    const result = pjps.map((pjp) => ({
      ...pjp,
      routes: routesByPjpId.get(pjp.id) ?? [],
    }));

    return { result };
  }

  async listPaidSaleVouchers(
    tenantDb: DataSource,
    user: { userId: string },
  ) {
    const vouchers = await tenantDb.getRepository(SaleVoucher).find({
      where: {
        status: In([SaleVoucherStatus.PAID, SaleVoucherStatus.PARTIALLY_PAID]),
      },
      relations: [...SALE_VOUCHER_RELATIONS],
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });

    return { result: vouchers };
  }

  async listApprovedSaleInvoices(
    tenantDb: DataSource,
    user: { userId: string },
  ) {
    const invoices = await tenantDb.getRepository(SaleInvoice).find({
      where: {
        salesmanId: user.userId,
      },
      relations: [...SALE_INVOICE_RELATIONS],
      order: { invoiceDate: 'DESC', createdAt: 'DESC' },
    });

    return { result: invoices };
  }

  async listAssignedDistributors(
    tenantDb: DataSource,
    user: { userId: string },
  ) {
    const assignments = await tenantDb.getRepository(SalesmanDistributor).find({
      where: { userId: user.userId },
      relations: [
        'distributor',
        'distributor.area',
        'distributor.area.region',
      ],
      order: { createdAt: 'ASC' },
    });

    const result = assignments
      .map((assignment) => assignment.distributor)
      .filter((distributor) => distributor && !distributor.isDeleted && distributor.isActive);

    return { result };
  }

  // retailer categories
  async listRetailerCategories(tenantDb: DataSource) {
    const categories = await tenantDb.getRepository(RetailerCategory).find({
      order: { name: 'ASC' },
    });
    return { result: categories };
  }

  // retailer channels
  async listRetailerChannels(tenantDb: DataSource) {
    const channels = await tenantDb.getRepository(RetailerChannel).find({
      order: { name: 'ASC' },
    });
    return { result: channels };
  }
}
