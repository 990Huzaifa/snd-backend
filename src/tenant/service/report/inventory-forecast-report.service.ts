import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { ProductCategory } from 'src/tenant-db/entities/product.entity';
import { OrderStatus } from 'src/tenant-db/entities/saleorder.entity';
import { ActivityLogService } from '../activity-log.service';
import {
  InventoryForecastInsightType,
  InventoryForecastInsightsDto,
  InventoryForecastOverviewDto,
} from '../../dto/report/inventory-forecast.dto';

const APPROVED_SALE_ORDER_STATUSES = [
  OrderStatus.APPROVED,
  OrderStatus.PROCESSING,
  OrderStatus.DELIVERED,
];

const DEFAULT_ANALYSIS_DAYS = 30;
const DEFAULT_FORECAST_DAYS = 30;
const DEFAULT_SLOW_MOVING_DAYS_COVER = 30;
const DEFAULT_SAFETY_FACTOR = 1.5;
const DEFAULT_LEAD_DAYS = 7;
const DEFAULT_CATEGORY_LIMIT = 10;
const RECOMMENDATION_LIMIT = 20;

type NormalizedFilters = {
  distributorId: string | null;
  categoryId: string | null;
  search: string | null;
  startDate: string;
  endDate: string;
  analysisDays: number;
  forecastDays: number;
  slowMovingDaysCover: number;
  safetyFactor: number;
  leadDays: number;
  categoryLimit: number;
};

type StockRow = {
  productId: string;
  quantityOnHand: string;
};

type ProductSalesRow = {
  productId: string;
  totalQty: string;
};

type DailySalesRow = {
  day: string;
  qty: string;
};

type ProductMetaRow = {
  productId: string;
  skuCode: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
};

type SkuMetric = {
  productId: string;
  skuCode: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  currentStock: number;
  totalSalesQty: number;
  avgDailyDemand: number;
  forecastDemand: number;
  daysCover: number | null;
  computedMin: number;
  computedMax: number;
  suggestedReorder: number;
  isHighDemand: boolean;
  isSlowMoving: boolean;
  isBelowMinimum: boolean;
  isUpdateStockLevels: boolean;
  isOverstock: boolean;
  isStockoutRisk: boolean;
};

@Injectable()
export class InventoryForecastReportService {
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

  private roundQty(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private isIsoDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  }

  private addDays(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private eachDate(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    let cursor = startDate;
    while (cursor <= endDate) {
      dates.push(cursor);
      cursor = this.addDays(cursor, 1);
    }
    return dates;
  }

  private async validateDistributor(
    tenantDb: DataSource,
    distributorId: string,
  ): Promise<void> {
    const exists = await tenantDb.getRepository(Distributor).exist({
      where: { id: distributorId },
    });
    if (!exists) {
      throw new NotFoundException('Distributor not found');
    }
  }

  private async validateCategory(
    tenantDb: DataSource,
    categoryId: string,
  ): Promise<void> {
    const exists = await tenantDb.getRepository(ProductCategory).exist({
      where: { id: categoryId },
    });
    if (!exists) {
      throw new NotFoundException('Category not found');
    }
  }

  private normalizeFilters(
    filters: InventoryForecastOverviewDto,
  ): NormalizedFilters {
    const analysisDays =
      Number.isFinite(Number(filters.analysisDays)) &&
      Number(filters.analysisDays) >= 1
        ? Math.floor(Number(filters.analysisDays))
        : DEFAULT_ANALYSIS_DAYS;
    const forecastDays =
      Number.isFinite(Number(filters.forecastDays)) &&
      Number(filters.forecastDays) >= 1
        ? Math.floor(Number(filters.forecastDays))
        : DEFAULT_FORECAST_DAYS;
    const slowMovingDaysCover =
      Number.isFinite(Number(filters.slowMovingDaysCover)) &&
      Number(filters.slowMovingDaysCover) >= 1
        ? Math.floor(Number(filters.slowMovingDaysCover))
        : DEFAULT_SLOW_MOVING_DAYS_COVER;
    const safetyFactor =
      Number.isFinite(Number(filters.safetyFactor)) &&
      Number(filters.safetyFactor) >= 0.1
        ? Number(filters.safetyFactor)
        : DEFAULT_SAFETY_FACTOR;
    const leadDays =
      Number.isFinite(Number(filters.leadDays)) && Number(filters.leadDays) >= 0
        ? Math.floor(Number(filters.leadDays))
        : DEFAULT_LEAD_DAYS;
    const categoryLimit =
      Number.isFinite(Number(filters.categoryLimit)) &&
      Number(filters.categoryLimit) >= 1
        ? Math.min(Math.floor(Number(filters.categoryLimit)), 100)
        : DEFAULT_CATEGORY_LIMIT;

    const endDateRaw = (filters.endDate ?? '').trim() || this.todayIsoDate();
    if (!this.isIsoDate(endDateRaw)) {
      throw new BadRequestException('endDate must be YYYY-MM-DD');
    }

    let startDateRaw = (filters.startDate ?? '').trim();
    if (!startDateRaw) {
      startDateRaw = this.addDays(endDateRaw, -(analysisDays - 1));
    }
    if (!this.isIsoDate(startDateRaw)) {
      throw new BadRequestException('startDate must be YYYY-MM-DD');
    }
    if (startDateRaw > endDateRaw) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    return {
      distributorId: (filters.distributorId ?? '').trim() || null,
      categoryId: (filters.categoryId ?? '').trim() || null,
      search: (filters.search ?? '').trim() || null,
      startDate: startDateRaw,
      endDate: endDateRaw,
      analysisDays,
      forecastDays,
      slowMovingDaysCover,
      safetyFactor,
      leadDays,
      categoryLimit,
    };
  }

  private async loadStockByProduct(
    tenantDb: DataSource,
    filters: NormalizedFilters,
  ): Promise<Map<string, number>> {
    const qb = tenantDb
      .createQueryBuilder()
      .select('sb."productId"', 'productId')
      .addSelect('COALESCE(SUM(sb."quantityOnHand"), 0)', 'quantityOnHand')
      .from('stock_balances', 'sb')
      .innerJoin('products', 'product', 'product.id = sb."productId"')
      .where('product."isDelete" = false')
      .andWhere('product."isActive" = true')
      .groupBy('sb."productId"');

    if (filters.distributorId) {
      qb.andWhere('sb."distributorId" = :distributorId', {
        distributorId: filters.distributorId,
      });
    }
    if (filters.categoryId) {
      qb.andWhere('product."categoryId" = :categoryId', {
        categoryId: filters.categoryId,
      });
    }
    if (filters.search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('product.name ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('product."skuCode" ILIKE :search', {
              search: `%${filters.search}%`,
            });
        }),
      );
    }

    const rows = (await qb.getRawMany()) as StockRow[];
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.productId, this.toNumber(row.quantityOnHand));
    }
    return map;
  }

  private async loadSalesByProduct(
    tenantDb: DataSource,
    filters: NormalizedFilters,
  ): Promise<Map<string, number>> {
    const statusList = APPROVED_SALE_ORDER_STATUSES.map((s) => `'${s}'`).join(
      ', ',
    );
    const params: unknown[] = [filters.startDate, filters.endDate];
    let paramIndex = 3;
    const conditions: string[] = [
      `so."orderStatus" IN (${statusList})`,
      `so."orderDate"::date BETWEEN $1::date AND $2::date`,
      `product."isDelete" = false`,
      `product."isActive" = true`,
    ];

    if (filters.distributorId) {
      conditions.push(`so."distributorId" = $${paramIndex}`);
      params.push(filters.distributorId);
      paramIndex += 1;
    }
    if (filters.categoryId) {
      conditions.push(`product."categoryId" = $${paramIndex}`);
      params.push(filters.categoryId);
      paramIndex += 1;
    }
    if (filters.search) {
      conditions.push(
        `(product.name ILIKE $${paramIndex} OR product."skuCode" ILIKE $${paramIndex})`,
      );
      params.push(`%${filters.search}%`);
      paramIndex += 1;
    }

    const sql = `
      SELECT soi."productId" AS "productId",
             COALESCE(SUM(soi.quantity), 0) AS "totalQty"
      FROM sale_order_items soi
      INNER JOIN sale_orders so ON so.id = soi."saleOrderId"
      INNER JOIN products product ON product.id = soi."productId"
      WHERE ${conditions.join(' AND ')}
      GROUP BY soi."productId"
    `;

    const rows = (await tenantDb.query(sql, params)) as ProductSalesRow[];
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.productId, this.toNumber(row.totalQty));
    }
    return map;
  }

  private async loadDailySalesTotals(
    tenantDb: DataSource,
    filters: NormalizedFilters,
  ): Promise<Map<string, number>> {
    const statusList = APPROVED_SALE_ORDER_STATUSES.map((s) => `'${s}'`).join(
      ', ',
    );
    const params: unknown[] = [filters.startDate, filters.endDate];
    let paramIndex = 3;
    const conditions: string[] = [
      `so."orderStatus" IN (${statusList})`,
      `so."orderDate"::date BETWEEN $1::date AND $2::date`,
      `product."isDelete" = false`,
      `product."isActive" = true`,
    ];

    if (filters.distributorId) {
      conditions.push(`so."distributorId" = $${paramIndex}`);
      params.push(filters.distributorId);
      paramIndex += 1;
    }
    if (filters.categoryId) {
      conditions.push(`product."categoryId" = $${paramIndex}`);
      params.push(filters.categoryId);
      paramIndex += 1;
    }
    if (filters.search) {
      conditions.push(
        `(product.name ILIKE $${paramIndex} OR product."skuCode" ILIKE $${paramIndex})`,
      );
      params.push(`%${filters.search}%`);
      paramIndex += 1;
    }

    const sql = `
      SELECT TO_CHAR(so."orderDate"::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(soi.quantity), 0) AS qty
      FROM sale_order_items soi
      INNER JOIN sale_orders so ON so.id = soi."saleOrderId"
      INNER JOIN products product ON product.id = soi."productId"
      WHERE ${conditions.join(' AND ')}
      GROUP BY TO_CHAR(so."orderDate"::date, 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    const rows = (await tenantDb.query(sql, params)) as DailySalesRow[];
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.day, this.toNumber(row.qty));
    }
    return map;
  }

  private async loadProductMeta(
    tenantDb: DataSource,
    productIds: string[],
  ): Promise<Map<string, ProductMetaRow>> {
    if (!productIds.length) {
      return new Map();
    }

    const rows = (await tenantDb.query(
      `
        SELECT product.id AS "productId",
               product."skuCode" AS "skuCode",
               product.name AS name,
               product."categoryId" AS "categoryId",
               category.name AS "categoryName"
        FROM products product
        LEFT JOIN product_categories category ON category.id = product."categoryId"
        WHERE product.id = ANY($1::uuid[])
      `,
      [productIds],
    )) as ProductMetaRow[];

    return new Map(rows.map((row) => [row.productId, row]));
  }

  private buildSkuMetrics(
    filters: NormalizedFilters,
    stockByProduct: Map<string, number>,
    salesByProduct: Map<string, number>,
    productMeta: Map<string, ProductMetaRow>,
  ): SkuMetric[] {
    const productIds = new Set<string>([
      ...stockByProduct.keys(),
      ...salesByProduct.keys(),
    ]);

    const metrics: SkuMetric[] = [];
    for (const productId of productIds) {
      const meta = productMeta.get(productId);
      if (!meta) {
        continue;
      }

      const currentStock = this.roundQty(stockByProduct.get(productId) ?? 0);
      const totalSalesQty = this.roundQty(salesByProduct.get(productId) ?? 0);
      if (currentStock <= 0 && totalSalesQty <= 0) {
        continue;
      }

      const avgDailyDemand = this.roundQty(
        totalSalesQty / filters.analysisDays,
      );
      const forecastDemand = this.roundQty(avgDailyDemand * filters.forecastDays);
      const daysCover =
        avgDailyDemand > 0
          ? this.roundQty(currentStock / avgDailyDemand)
          : null;
      const computedMin = this.roundQty(
        avgDailyDemand * filters.leadDays * filters.safetyFactor,
      );
      const computedMax = this.roundQty(
        avgDailyDemand *
          (filters.leadDays + filters.forecastDays) *
          filters.safetyFactor,
      );
      const suggestedReorder = Math.max(
        0,
        Math.ceil(computedMax - currentStock),
      );

      metrics.push({
        productId,
        skuCode: meta.skuCode,
        name: meta.name,
        categoryId: meta.categoryId,
        categoryName: meta.categoryName,
        currentStock,
        totalSalesQty,
        avgDailyDemand,
        forecastDemand,
        daysCover,
        computedMin,
        computedMax,
        suggestedReorder,
        isHighDemand: false,
        isSlowMoving: false,
        isBelowMinimum: false,
        isUpdateStockLevels: false,
        isOverstock: false,
        isStockoutRisk: false,
      });
    }

    const withDemand = metrics
      .filter((m) => m.avgDailyDemand > 0)
      .sort((a, b) => a.avgDailyDemand - b.avgDailyDemand);
    const p80Index =
      withDemand.length === 0
        ? 0
        : Math.min(
            Math.floor(withDemand.length * 0.8),
            withDemand.length - 1,
          );
    const highDemandThreshold =
      withDemand.length === 0
        ? Number.POSITIVE_INFINITY
        : withDemand[p80Index].avgDailyDemand;

    const idealCoverMin = filters.leadDays * filters.safetyFactor;
    const idealCoverMax = filters.slowMovingDaysCover;

    for (const sku of metrics) {
      sku.isHighDemand =
        sku.avgDailyDemand > 0 && sku.avgDailyDemand >= highDemandThreshold;
      sku.isSlowMoving =
        sku.currentStock > 0 &&
        (sku.avgDailyDemand <= 0 ||
          (sku.daysCover !== null &&
            sku.daysCover > filters.slowMovingDaysCover));
      sku.isBelowMinimum =
        sku.avgDailyDemand > 0 && sku.currentStock < sku.computedMin;
      sku.isUpdateStockLevels =
        sku.daysCover === null
          ? sku.currentStock > 0
          : sku.daysCover < idealCoverMin || sku.daysCover > idealCoverMax;
      sku.isOverstock =
        sku.avgDailyDemand > 0 && sku.currentStock > sku.computedMax;
      sku.isStockoutRisk =
        sku.avgDailyDemand > 0 &&
        sku.currentStock < sku.avgDailyDemand * filters.forecastDays;
    }

    return metrics.sort((a, b) => a.name.localeCompare(b.name));
  }

  private buildChart(
    filters: NormalizedFilters,
    dailySales: Map<string, number>,
    metrics: SkuMetric[],
  ) {
    const totalStock = this.roundQty(
      metrics.reduce((sum, sku) => sum + sku.currentStock, 0),
    );
    const totalAvgDailyDemand = this.roundQty(
      metrics.reduce((sum, sku) => sum + sku.avgDailyDemand, 0),
    );

    const chartEnd = this.addDays(filters.endDate, filters.forecastDays);
    const series = this.eachDate(filters.startDate, chartEnd).map((date) => {
      const isHistorical = date <= filters.endDate;
      if (isHistorical) {
        return {
          date,
          salesQty: this.roundQty(dailySales.get(date) ?? 0),
          forecastQty: null as number | null,
          stockOnHandEstimate:
            date === filters.endDate ? totalStock : (null as number | null),
        };
      }

      return {
        date,
        salesQty: null as number | null,
        forecastQty: totalAvgDailyDemand,
        stockOnHandEstimate: 0,
      };
    });

    let runningStock = totalStock;
    for (const point of series) {
      if (point.date <= filters.endDate) {
        if (point.date === filters.endDate) {
          point.stockOnHandEstimate = runningStock;
        }
        continue;
      }
      runningStock = Math.max(
        0,
        this.roundQty(runningStock - (point.forecastQty ?? 0)),
      );
      point.stockOnHandEstimate = runningStock;
    }

    return { series };
  }

  private buildCategories(
    metrics: SkuMetric[],
    categoryLimit: number,
  ) {
    const byCategory = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        currentStock: number;
        forecastDemand: number;
        products: number;
      }
    >();

    for (const sku of metrics) {
      if (!sku.categoryId) {
        continue;
      }
      const existing = byCategory.get(sku.categoryId);
      if (existing) {
        existing.currentStock = this.roundQty(
          existing.currentStock + sku.currentStock,
        );
        existing.forecastDemand = this.roundQty(
          existing.forecastDemand + sku.forecastDemand,
        );
        existing.products += 1;
      } else {
        byCategory.set(sku.categoryId, {
          categoryId: sku.categoryId,
          categoryName: sku.categoryName ?? 'Uncategorized',
          currentStock: sku.currentStock,
          forecastDemand: sku.forecastDemand,
          products: 1,
        });
      }
    }

    return [...byCategory.values()]
      .sort((a, b) => b.forecastDemand - a.forecastDemand)
      .slice(0, categoryLimit);
  }

  private buildRecommendations(metrics: SkuMetric[]) {
    const reorderCandidates = metrics
      .filter((sku) => sku.isStockoutRisk && sku.suggestedReorder > 0)
      .sort((a, b) => {
        const aCover = a.daysCover ?? Number.POSITIVE_INFINITY;
        const bCover = b.daysCover ?? Number.POSITIVE_INFINITY;
        if (aCover !== bCover) {
          return aCover - bCover;
        }
        return b.suggestedReorder - a.suggestedReorder;
      });

    const recommendations: Array<{
      type: 'REORDER' | 'OVERSTOCK_REVIEW';
      productId?: string;
      productName?: string;
      message: string;
      suggestedReorder?: number;
      daysCover?: number | null;
    }> = [];

    for (const sku of reorderCandidates) {
      if (recommendations.length >= RECOMMENDATION_LIMIT - 1) {
        break;
      }
      const coverLabel =
        sku.daysCover === null ? 'n/a' : `${sku.daysCover} days cover`;
      recommendations.push({
        type: 'REORDER',
        productId: sku.productId,
        productName: sku.name,
        message: `suggested reorder: ${sku.suggestedReorder} units (${coverLabel}).`,
        suggestedReorder: sku.suggestedReorder,
        daysCover: sku.daysCover,
      });
    }

    const overstockCount = metrics.filter((sku) => sku.isOverstock).length;
    if (overstockCount > 0) {
      recommendations.push({
        type: 'OVERSTOCK_REVIEW',
        message: `${overstockCount} SKUs exceed computed maximum level.`,
      });
    }

    return recommendations;
  }

  private filterByInsightType(
    metrics: SkuMetric[],
    type: InventoryForecastInsightType,
  ): SkuMetric[] {
    switch (type) {
      case InventoryForecastInsightType.HIGH_DEMAND:
        return metrics.filter((sku) => sku.isHighDemand);
      case InventoryForecastInsightType.SLOW_MOVING:
        return metrics.filter((sku) => sku.isSlowMoving);
      case InventoryForecastInsightType.BELOW_MINIMUM:
        return metrics.filter((sku) => sku.isBelowMinimum);
      case InventoryForecastInsightType.UPDATE_STOCK_LEVELS:
        return metrics.filter((sku) => sku.isUpdateStockLevels);
      case InventoryForecastInsightType.OVERSTOCK:
        return metrics.filter((sku) => sku.isOverstock);
      case InventoryForecastInsightType.STOCKOUT_RISK:
        return metrics.filter((sku) => sku.isStockoutRisk);
      default:
        return [];
    }
  }

  private toInsightItem(sku: SkuMetric) {
    return {
      productId: sku.productId,
      skuCode: sku.skuCode,
      name: sku.name,
      categoryName: sku.categoryName,
      currentStock: sku.currentStock,
      avgDailyDemand: sku.avgDailyDemand,
      forecastDemand: sku.forecastDemand,
      daysCover: sku.daysCover,
      computedMin: sku.computedMin,
      computedMax: sku.computedMax,
      suggestedReorder: sku.suggestedReorder,
    };
  }

  private async loadMetrics(
    tenantDb: DataSource,
    filters: NormalizedFilters,
  ): Promise<{
    metrics: SkuMetric[];
    dailySales: Map<string, number>;
  }> {
    if (filters.distributorId) {
      await this.validateDistributor(tenantDb, filters.distributorId);
    }
    if (filters.categoryId) {
      await this.validateCategory(tenantDb, filters.categoryId);
    }

    const [stockByProduct, salesByProduct, dailySales] = await Promise.all([
      this.loadStockByProduct(tenantDb, filters),
      this.loadSalesByProduct(tenantDb, filters),
      this.loadDailySalesTotals(tenantDb, filters),
    ]);

    const productIds = [
      ...new Set([...stockByProduct.keys(), ...salesByProduct.keys()]),
    ];
    const productMeta = await this.loadProductMeta(tenantDb, productIds);
    const metrics = this.buildSkuMetrics(
      filters,
      stockByProduct,
      salesByProduct,
      productMeta,
    );

    return { metrics, dailySales };
  }

  async getOverview(
    tenantDb: DataSource,
    query: InventoryForecastOverviewDto,
    user: { userId: string },
  ) {
    const filters = this.normalizeFilters(query);
    const { metrics, dailySales } = await this.loadMetrics(tenantDb, filters);

    const kpis = {
      highDemand: metrics.filter((sku) => sku.isHighDemand).length,
      slowMoving: metrics.filter((sku) => sku.isSlowMoving).length,
      belowMinimum: metrics.filter((sku) => sku.isBelowMinimum).length,
      updateStockLevels: metrics.filter((sku) => sku.isUpdateStockLevels)
        .length,
      overstock: metrics.filter((sku) => sku.isOverstock).length,
      stockoutRisk: metrics.filter((sku) => sku.isStockoutRisk).length,
      activeSkus: metrics.length,
    };

    const chart = this.buildChart(filters, dailySales, metrics);
    const categories = this.buildCategories(metrics, filters.categoryLimit);
    const recommendations = this.buildRecommendations(metrics);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'INVENTORY_FORECAST_OVERVIEW_VIEWED',
      description: 'Inventory forecast overview report viewed',
      metadata: {
        ...filters,
        activeSkus: kpis.activeSkus,
      },
    });

    return {
      filters,
      kpis,
      chart,
      categories,
      recommendations,
    };
  }

  async getInsights(
    tenantDb: DataSource,
    query: InventoryForecastInsightsDto,
    user: { userId: string },
  ) {
    const filters = this.normalizeFilters(query);
    const page = this.normalizePage(query.page);
    const limit = this.normalizeLimit(query.limit);
    const { metrics } = await this.loadMetrics(tenantDb, filters);
    const matched = this.filterByInsightType(metrics, query.type);
    const total = matched.length;
    const items = matched
      .slice((page - 1) * limit, page * limit)
      .map((sku) => this.toInsightItem(sku));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'INVENTORY_FORECAST_INSIGHTS_VIEWED',
      description: 'Inventory forecast insights viewed',
      metadata: {
        ...filters,
        type: query.type,
        total,
        page,
        limit,
      },
    });

    return {
      filters: {
        ...filters,
        type: query.type,
      },
      items,
      meta: {
        page,
        limit,
        total,
      },
    };
  }
}
