import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { Product } from 'src/tenant-db/entities/product.entity';
import {
  OrderStatus,
  SaleOrderItem,
} from 'src/tenant-db/entities/saleorder.entity';
import { ProductSalesReportDto } from '../../dto/report/product-sales-report.dto';
import { ActivityLogService } from '../activity-log.service';

const COUNTED_ORDER_STATUSES = [
  OrderStatus.APPROVED,
  OrderStatus.PROCESSING,
  OrderStatus.DELIVERED,
] as const;

type FilterInput = {
  startDate: string | null;
  endDate: string | null;
  productId: string | null;
};

type AggregateRow = {
  productId: string;
  productName: string;
  skuCode: string;
  image: string | null;
  categoryId: string | null;
  categoryName: string | null;
  brandName: string | null;
  totalQuantity: string;
  totalRevenue: string;
  orderCount: string;
};

type TrendRow = {
  date: string;
  quantity: string;
  revenue: string;
  orderCount: string;
};

type CategoryRow = {
  categoryId: string;
  categoryName: string;
  quantity: string;
  revenue: string;
};

type FlavourRow = {
  productFlavourId: string;
  flavourName: string;
  quantity: string;
  revenue: string;
};

type SummaryRow = {
  totalQuantity: string;
  totalRevenue: string;
  uniqueProducts: string;
  orderCount: string;
};

@Injectable()
export class ProductSalesReportService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private normalizePage(value?: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  private normalizeLimit(value?: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) {
      return 10;
    }
    return Math.min(Math.floor(n), 100);
  }

  private toNumber(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private parseDateBoundary(
    value: string | undefined,
    endOfDay: boolean,
  ): Date | null {
    const normalized = (value ?? '').trim();
    if (!normalized) {
      return null;
    }

    const date = new Date(
      endOfDay ? `${normalized}T23:59:59.999Z` : `${normalized}T00:00:00.000Z`,
    );
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return date;
  }

  private resolveFilters(dto: ProductSalesReportDto): FilterInput {
    const startDate = (dto.startDate ?? '').trim() || null;
    const endDate = (dto.endDate ?? '').trim() || null;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    return {
      startDate,
      endDate,
      productId: (dto.productId ?? '').trim() || null,
    };
  }

  private eachDateKey(start: Date, endInclusive: Date): string[] {
    const keys: string[] = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= endInclusive.getTime()) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  }

  private buildBaseQuery(tenantDb: DataSource, filters: FilterInput) {
    const qb = tenantDb
      .getRepository(SaleOrderItem)
      .createQueryBuilder('soi')
      .innerJoin('soi.saleOrder', 'so')
      .innerJoin('soi.product', 'product')
      .leftJoin('product.category', 'category')
      .leftJoin('product.brand', 'brand')
      .where('so.orderStatus IN (:...statuses)', {
        statuses: [...COUNTED_ORDER_STATUSES],
      })
      .andWhere('product.isDelete = false');

    return this.applyFilters(qb, filters);
  }

  private applyFilters(
    qb: SelectQueryBuilder<SaleOrderItem>,
    filters: FilterInput,
  ) {
    if (filters.productId) {
      qb.andWhere('soi.productId = :productId', {
        productId: filters.productId,
      });
    }

    const startDate = this.parseDateBoundary(
      filters.startDate ?? undefined,
      false,
    );
    const endDate = this.parseDateBoundary(filters.endDate ?? undefined, true);

    if (startDate) {
      qb.andWhere('so.orderDate >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('so.orderDate <= :endDate', { endDate });
    }

    return qb;
  }

  private async fetchSummary(
    tenantDb: DataSource,
    filters: FilterInput,
  ) {
    const row = await this.buildBaseQuery(tenantDb, filters)
      .select('COALESCE(SUM(soi.quantity), 0)', 'totalQuantity')
      .addSelect('COALESCE(SUM(soi.totalAmount), 0)', 'totalRevenue')
      .addSelect('COUNT(DISTINCT soi.productId)', 'uniqueProducts')
      .addSelect('COUNT(DISTINCT so.id)', 'orderCount')
      .getRawOne<SummaryRow>();

    const totalQuantity = this.toNumber(row?.totalQuantity);
    const totalRevenue = this.roundMoney(this.toNumber(row?.totalRevenue));
    const uniqueProducts = this.toNumber(row?.uniqueProducts);
    const orderCount = this.toNumber(row?.orderCount);

    let dayCount = 1;
    if (filters.startDate && filters.endDate) {
      const start = this.parseDateBoundary(filters.startDate, false)!;
      const end = this.parseDateBoundary(filters.endDate, false)!;
      dayCount = Math.max(this.eachDateKey(start, end).length, 1);
    }

    return {
      totalQuantity,
      totalRevenue,
      uniqueProducts,
      orderCount,
      avgDailyQuantity: this.roundMoney(totalQuantity / dayCount),
      avgDailyRevenue: this.roundMoney(totalRevenue / dayCount),
    };
  }

  private async fetchTrendChart(
    tenantDb: DataSource,
    filters: FilterInput,
  ) {
    const rows = await this.buildBaseQuery(tenantDb, filters)
      .select(`TO_CHAR(so."orderDate", 'YYYY-MM-DD')`, 'date')
      .addSelect('COALESCE(SUM(soi.quantity), 0)', 'quantity')
      .addSelect('COALESCE(SUM(soi.totalAmount), 0)', 'revenue')
      .addSelect('COUNT(DISTINCT so.id)', 'orderCount')
      .groupBy(`TO_CHAR(so."orderDate", 'YYYY-MM-DD')`)
      .orderBy(`TO_CHAR(so."orderDate", 'YYYY-MM-DD')`, 'ASC')
      .getRawMany<TrendRow>();

    return rows.map((row) => ({
      date: row.date,
      label: row.date,
      quantity: this.toNumber(row.quantity),
      revenue: this.roundMoney(this.toNumber(row.revenue)),
      orderCount: this.toNumber(row.orderCount),
    }));
  }

  private buildGraphSeries(
    filters: FilterInput,
    trend: Array<{
      date: string;
      quantity: number;
      revenue: number;
    }>,
  ) {
    const byDate = new Map(trend.map((row) => [row.date, row]));

    if (filters.startDate && filters.endDate) {
      const start = this.parseDateBoundary(filters.startDate, false)!;
      const end = this.parseDateBoundary(filters.endDate, false)!;
      return this.eachDateKey(start, end).map((date) => {
        const hit = byDate.get(date);
        return {
          date,
          quantity: hit?.quantity ?? 0,
          revenue: hit?.revenue ?? 0,
        };
      });
    }

    return trend.map((row) => ({
      date: row.date,
      quantity: row.quantity,
      revenue: row.revenue,
    }));
  }

  private async fetchByProductChart(
    tenantDb: DataSource,
    filters: FilterInput,
  ) {
    const rows = await this.buildBaseQuery(tenantDb, filters)
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.skuCode', 'skuCode')
      .addSelect('COALESCE(SUM(soi.quantity), 0)', 'totalQuantity')
      .addSelect('COALESCE(SUM(soi.totalAmount), 0)', 'totalRevenue')
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('product.skuCode')
      .orderBy('COALESCE(SUM(soi.totalAmount), 0)', 'DESC')
      .addOrderBy('COALESCE(SUM(soi.quantity), 0)', 'DESC')
      .limit(10)
      .getRawMany<AggregateRow>();

    const totalRevenue = rows.reduce(
      (sum, row) => sum + this.toNumber(row.totalRevenue),
      0,
    );

    return rows.map((row) => {
      const revenue = this.roundMoney(this.toNumber(row.totalRevenue));
      return {
        productId: row.productId,
        productName: row.productName,
        skuCode: row.skuCode,
        quantity: this.toNumber(row.totalQuantity),
        revenue,
        sharePercent:
          totalRevenue > 0
            ? this.roundMoney((revenue / totalRevenue) * 100)
            : 0,
      };
    });
  }

  private async fetchByCategoryChart(
    tenantDb: DataSource,
    filters: FilterInput,
  ) {
    const rows = await this.buildBaseQuery(tenantDb, filters)
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COALESCE(SUM(soi.quantity), 0)', 'quantity')
      .addSelect('COALESCE(SUM(soi.totalAmount), 0)', 'revenue')
      .andWhere('category.id IS NOT NULL')
      .groupBy('category.id')
      .addGroupBy('category.name')
      .orderBy('COALESCE(SUM(soi.totalAmount), 0)', 'DESC')
      .limit(10)
      .getRawMany<CategoryRow>();

    return rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      quantity: this.toNumber(row.quantity),
      revenue: this.roundMoney(this.toNumber(row.revenue)),
    }));
  }

  private async fetchByFlavourChart(
    tenantDb: DataSource,
    filters: FilterInput,
  ) {
    if (!filters.productId) {
      return [];
    }

    const rows = await this.buildBaseQuery(tenantDb, filters)
      .leftJoin('soi.productFlavour', 'productFlavour')
      .leftJoin('productFlavour.flavour', 'flavour')
      .select('soi.productFlavourId', 'productFlavourId')
      .addSelect('flavour.name', 'flavourName')
      .addSelect('COALESCE(SUM(soi.quantity), 0)', 'quantity')
      .addSelect('COALESCE(SUM(soi.totalAmount), 0)', 'revenue')
      .groupBy('soi.productFlavourId')
      .addGroupBy('flavour.name')
      .orderBy('COALESCE(SUM(soi.totalAmount), 0)', 'DESC')
      .limit(10)
      .getRawMany<FlavourRow>();

    return rows.map((row) => ({
      productFlavourId: row.productFlavourId,
      flavourName: row.flavourName ?? 'Unknown',
      quantity: this.toNumber(row.quantity),
      revenue: this.roundMoney(this.toNumber(row.revenue)),
    }));
  }

  private async fetchProductList(
    tenantDb: DataSource,
    filters: FilterInput,
    page: number,
    limit: number,
  ) {
    const countRow = await this.buildBaseQuery(tenantDb, filters)
      .select('COUNT(DISTINCT product.id)', 'cnt')
      .getRawOne<{ cnt: string }>();
    const total = this.toNumber(countRow?.cnt);

    const rows = await this.buildBaseQuery(tenantDb, filters)
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.skuCode', 'skuCode')
      .addSelect('product.image', 'image')
      .addSelect('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('brand.name', 'brandName')
      .addSelect('COALESCE(SUM(soi.quantity), 0)', 'totalQuantity')
      .addSelect('COALESCE(SUM(soi.totalAmount), 0)', 'totalRevenue')
      .addSelect('COUNT(DISTINCT so.id)', 'orderCount')
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('product.skuCode')
      .addGroupBy('product.image')
      .addGroupBy('category.id')
      .addGroupBy('category.name')
      .addGroupBy('brand.name')
      .orderBy('COALESCE(SUM(soi.totalAmount), 0)', 'DESC')
      .addOrderBy('COALESCE(SUM(soi.quantity), 0)', 'DESC')
      .addOrderBy('product.name', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<AggregateRow>();

    const list = rows.map((row, index) => ({
      rank: (page - 1) * limit + index + 1,
      productId: row.productId,
      productName: row.productName,
      skuCode: row.skuCode,
      image: row.image,
      category: row.categoryId
        ? { id: row.categoryId, name: row.categoryName }
        : null,
      brandName: row.brandName,
      totalQuantity: this.toNumber(row.totalQuantity),
      totalRevenue: this.roundMoney(this.toNumber(row.totalRevenue)),
      orderCount: this.toNumber(row.orderCount),
    }));

    return { list, total };
  }

  async getOverview(
    tenantDb: DataSource,
    dto: ProductSalesReportDto,
    actor: { userId: string },
  ) {
    const filters = this.resolveFilters(dto);
    const page = this.normalizePage(dto.page);
    const limit = this.normalizeLimit(dto.limit);

    if (filters.productId) {
      const productExists = await tenantDb.getRepository(Product).exist({
        where: { id: filters.productId, isDelete: false },
      });
      if (!productExists) {
        throw new NotFoundException('Product not found');
      }
    }

    const [summary, trend, byProduct, byCategory, byFlavour, listResult] =
      await Promise.all([
        this.fetchSummary(tenantDb, filters),
        this.fetchTrendChart(tenantDb, filters),
        this.fetchByProductChart(tenantDb, filters),
        this.fetchByCategoryChart(tenantDb, filters),
        this.fetchByFlavourChart(tenantDb, filters),
        this.fetchProductList(tenantDb, filters, page, limit),
      ]);

    const graphSeries = this.buildGraphSeries(filters, trend);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actor.userId,
      action: 'PRODUCT_SALES_REPORT_VIEWED',
      description: 'Product sales report viewed',
      metadata: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        productId: filters.productId,
        totalRevenue: summary.totalRevenue,
        uniqueProducts: summary.uniqueProducts,
      },
    });

    return {
      filters: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        productId: filters.productId,
        orderStatuses: [...COUNTED_ORDER_STATUSES],
      },
      summary,
      charts: {
        trend,
        byProduct,
        byCategory,
        byFlavour,
      },
      graph: {
        series: graphSeries,
      },
      list: listResult.list,
      pagination: {
        page,
        limit,
        total: listResult.total,
      },
    };
  }
}
