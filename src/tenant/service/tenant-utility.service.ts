import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Designation } from 'src/tenant-db/entities/user.entity';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { Region } from 'src/tenant-db/entities/region.entity';
import { Area } from 'src/tenant-db/entities/area.entity';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import {
  Flavour,
  Product,
  ProductBrand,
  ProductCategory,
  ProductPricing,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { StockBalance } from 'src/tenant-db/entities/stock.entity';
import { Retailer, RetailerCategory, RetailerChannel } from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { User, UserType } from 'src/tenant-db/entities/user.entity';
import { PJP, PJPStatus } from 'src/tenant-db/entities/pjp.entity';
import {
  OrderStatus,
  SaleOrder,
  SaleOrderItem,
} from 'src/tenant-db/entities/saleorder.entity';

@Injectable()
export class TenantUtilityService {
  private async getUsersByUserType(tenantDb: DataSource, type: UserType) {
    const users = await tenantDb.getRepository(User).find({
      where: {
        isDeleted: false,
        isActive: true,
        type: type,
      },
      relations: { role: true },
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        role: { id: true, code: true, name: true },
      },
      order: { name: 'ASC' },
    });

    return { result: users };
  }

  async getSalesmanUsers(tenantDb: DataSource) {
    return this.getUsersByUserType(tenantDb, UserType.SALESMAN);
  }

  async getMerchandiserUsers(tenantDb: DataSource) {
    return this.getUsersByUserType(tenantDb, UserType.MERCHANDISER);
  }

  async getSPGUsers(tenantDb: DataSource) {
    return this.getUsersByUserType(tenantDb, UserType.SPG);
  }

  async getRiderUsers(tenantDb: DataSource) {
    return this.getUsersByUserType(tenantDb, UserType.RIDER);
  }

  async getAdminUsers(tenantDb: DataSource) {
    return this.getUsersByUserType(tenantDb, UserType.ADMIN);
  }

  async getDesignations(tenantDb: DataSource) {
    const designations = await tenantDb.getRepository(Designation).find({
      where: { isActive: true },
      select: ['id', 'name', 'slug', 'description'],
      order: { name: 'ASC' },
    });

    return { result: designations };
  }

  async getRoles(tenantDb: DataSource) {
    const roles = await tenantDb.getRepository(Role).find({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
      },
      order: { name: 'ASC' },
    });
    // remove permissions array from roles
    return { result: roles };
    }

  async getPermissions(tenantDb: DataSource) {
    const permissions = await tenantDb.getRepository(Permission).find({
      where: { isActive: true },
      select: ['id', 'code', 'name'],
      order: { name: 'ASC' },
    });

    return { result: permissions };
  }

  async getRegions(tenantDb: DataSource) {
    const regions = await tenantDb.getRepository(Region).find({
      where: { isActive: true },
      select: ['id', 'name', 'code'],
      order: { name: 'ASC' },
    });

    return { result: regions };
  }

  async getRegionsByCityId(tenantDb: DataSource, cityId: string) {
    const regions = await tenantDb.getRepository(Region).find({
      where: { cityId: cityId, isActive: true },
      select: ['id', 'name', 'code'],
      order: { name: 'ASC' },
    });

    return { result: regions };
  }

  async getAreas(tenantDb: DataSource, regionId: string) {
    const areas = await tenantDb.getRepository(Area).find({
      where: { region: { id: regionId }},
      select: ['id', 'name', 'code'],
      order: { name: 'ASC' },
    });

    return { result: areas };
  }

  async getDistributors(tenantDb: DataSource, areaId?: string) {
    const distributorsQueryBuilder = tenantDb.getRepository(Distributor).createQueryBuilder('distributor').leftJoin('distributor.area', 'area').where('distributor.isDeleted = :isDeleted', { isDeleted: false }).andWhere('distributor.isActive = :isActive', { isActive: true });
    if (areaId) {   
      distributorsQueryBuilder.andWhere('area.id = :areaId', { areaId: areaId });
    }
    const distributors = await distributorsQueryBuilder.getMany();

    return { result: distributors };
  }

  async getProductCategories(tenantDb: DataSource) {
    const productCategories = await tenantDb.getRepository(ProductCategory).find({
      select: ['id', 'name', 'slug'],
      order: { name: 'ASC' },
    });

    return { result: productCategories };
  }

  async getProductBrands(tenantDb: DataSource) {
    const productBrands = await tenantDb.getRepository(ProductBrand).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });

    return { result: productBrands };
  }

  async getFlavours(tenantDb: DataSource) {
    const flavours = await tenantDb.getRepository(Flavour).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });

    return { result: flavours };
  }

  async uoms(tenantDb: DataSource) {
    const uoms = await tenantDb.getRepository(Uom).find({
      select: ['id', 'name', 'isBase'],
      where: { isBase: false },
      order: { name: 'ASC' },
    });

    return { result: uoms };
  }


  async getRetailerCategories(tenantDb: DataSource) {
    const retailerCategories = await tenantDb.getRepository(RetailerCategory).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });

    return { result: retailerCategories };
  }

  async getRetailerChannels(tenantDb: DataSource) {
    const retailerChannels = await tenantDb.getRepository(RetailerChannel).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });

    return { result: retailerChannels };
  }

  async getProductList(tenantDb: DataSource) {
    const productList = await tenantDb.getRepository(Product).find({
      select: {
        id: true,
        name: true,
        skuCode: true,
        flavours: {
          id: true,
          flavourId: true,
          flavour: {
            id: true,
            name: true,
          },
        },
      },
      relations: {
        pricing: {
          uom: true,
        },
        flavours: {
          flavour: true,
        },
      },
      order: { name: 'ASC' },
    });

    return { result: productList };
  }

  async getRoutes(tenantDb: DataSource) {
    const routes = await tenantDb.getRepository(Route).find({
      select: {
        id: true,
        name: true,
        area: {
          id: true,
          name: true,
          code: true,
        },
        distributor: {
          id: true,
          name: true,
          code: true,
        },
      },
      relations: {
        area: true,
        distributor: true,
      },
    });

    return { result: routes };
  }

  async getPJPsByUserId(tenantDb: DataSource, userId: string) {
    const pjps = await tenantDb.getRepository(PJP).find({
      where: { salesmanId: userId, status: PJPStatus.ACTIVE },
      relations: { salesman: true },
      order: { weekStartDate: 'DESC' },
    });

    return { result: pjps };
  }

  async getRoutesByUserId(tenantDb: DataSource, userId: string) {
    // fetch pjps by user id
    const pjpsResult = await this.getPJPsByUserId(tenantDb, userId);
    // fetch routes by pjp ids
    const routesResult = await tenantDb.getRepository(Route).find({
      where: { pjpRoutes: { pjpId: In(pjpsResult.result.map((pjp: PJP) => pjp.id)) } },
      relations: { pjpRoutes: true },
      order: { name: 'ASC' },
    });
    return { result: routesResult };  
  }

  async getRetailers(tenantDb: DataSource) {
    const retailers = await tenantDb.getRepository(Retailer).find({
      select: ['id', 'shopName'],
      order: { shopName: 'ASC' },
    });

    return { result: retailers };
  }

  async getStockProductsList(
    tenantDb: DataSource,
    distributorId: string,
    search?: string,
  ) {
    const normalizedDistributorId = (distributorId ?? '').trim();
    if (!normalizedDistributorId) {
      throw new BadRequestException('distributorId is required');
    }

    const qb = tenantDb
      .getRepository(StockBalance)
      .createQueryBuilder('sb')
      .innerJoinAndSelect('sb.product', 'product')
      .innerJoinAndSelect('sb.productFlavour', 'productFlavour')
      .innerJoinAndSelect('productFlavour.flavour', 'flavour')
      .innerJoinAndSelect('sb.uom', 'uom')
      .where('sb.distributorId = :distributorId', { distributorId: normalizedDistributorId })
      .andWhere('product.isDelete = :isDelete', { isDelete: false })
      .andWhere('product.isActive = :isActive', { isActive: true });

    const normalizedSearch = (search ?? '').trim();
    if (normalizedSearch) {
      qb.andWhere('(product.name ILIKE :search OR product."skuCode" ILIKE :search)', {
        search: `%${normalizedSearch}%`,
      });
    }

    qb.orderBy('product.name', 'ASC')
      .addOrderBy('flavour.name', 'ASC')
      .addOrderBy('uom.name', 'ASC');

    const balances = await qb.getMany();
    if (!balances.length) {
      return { result: [] };
    }

    const productIds = [...new Set(balances.map((balance) => balance.productId))];
    const pricings = await tenantDb.getRepository(ProductPricing).find({
      where: { productId: In(productIds) },
      select: ['productId', 'uomId', 'tradePrice', 'retailPrice'],
    });

    const pricingMap = new Map(
      pricings.map((pricing) => [`${pricing.productId}:${pricing.uomId}`, pricing]),
    );

    const result = balances.map((balance) => {
      const pricing = pricingMap.get(`${balance.productId}:${balance.uomId}`);

      return {
        id: balance.product.id,
        name: balance.product.name,
        skuCode: balance.product.skuCode,
        uomId: balance.uomId,
        uom: balance.uom
          ? {
              id: balance.uom.id,
              name: balance.uom.name,
            }
          : null,
        productFlavourId: balance.productFlavourId,
        productFlavour: balance.productFlavour?.flavour
          ? {
              id: balance.productFlavour.flavour.id,
              name: balance.productFlavour.flavour.name,
            }
          : null,
        quantityAvailable: balance.quantityAvailable,
        quantityOnHand: balance.quantityOnHand,
        purchaseUnitPrice: Number(pricing?.tradePrice ?? 0),
        tradeUnitPrice: Number(pricing?.tradePrice ?? 0),
        retailUnitPrice: Number(pricing?.retailPrice ?? 0),
      };
    });

    return { result };
  }

  async getSaleOrders(
    tenantDb: DataSource,
    status?: string,
    distributorId?: string,
  ) {
    const normalizedStatus = (status ?? '').trim();
    if (normalizedStatus && !Object.values(OrderStatus).includes(normalizedStatus as OrderStatus)) {
      throw new BadRequestException('Invalid sale order status');
    }

    const normalizedDistributorId = (distributorId ?? '').trim();

    const qb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .leftJoin('so.retailer', 'retailer')
      .leftJoin('so.distributor', 'distributor')
      .leftJoin('so.salesman', 'salesman')
      .leftJoin('so.route', 'route')
      .select([
        'so.id',
        'so.orderNumber',
        'so.orderStatus',
        'so.orderDate',
        'so.totalAmount',
        'so.distributorId',
        'distributor.id',
        'distributor.name',
        'retailer.id',
        'retailer.shopName',
        'retailer.address',
        'salesman.id',
        'salesman.name',
        'route.id',
        'route.name',
      ]);

    if (normalizedStatus) {
      qb.andWhere('so."orderStatus" = :status', { status: normalizedStatus });
    }

    if (normalizedDistributorId) {
      qb.andWhere('so."distributorId" = :distributorId', {
        distributorId: normalizedDistributorId,
      });
    }

    const saleOrders = await qb
      .orderBy('so.orderDate', 'DESC')
      .addOrderBy('so.orderNumber', 'DESC')
      .getMany();

    const saleOrderIds = saleOrders.map((order) => order.id);
    const itemStatsByOrderId = new Map<
      string,
      { totalProducts: number; totalQuantity: number }
    >();

    if (saleOrderIds.length) {
      const itemStats = await tenantDb
        .getRepository(SaleOrderItem)
        .createQueryBuilder('soi')
        .select('soi.saleOrderId', 'saleOrderId')
        .addSelect('COUNT(DISTINCT soi."productId")', 'totalProducts')
        .addSelect('COALESCE(SUM(soi.quantity), 0)', 'totalQuantity')
        .where('soi.saleOrderId IN (:...saleOrderIds)', { saleOrderIds })
        .groupBy('soi.saleOrderId')
        .getRawMany<{
          saleOrderId: string;
          totalProducts: string;
          totalQuantity: string;
        }>();

      for (const row of itemStats) {
        itemStatsByOrderId.set(row.saleOrderId, {
          totalProducts: Number(row.totalProducts),
          totalQuantity: Number(row.totalQuantity),
        });
      }
    }

    const result = saleOrders.map((order) => {
      const stats = itemStatsByOrderId.get(order.id);
      return {
        ...order,
        totalProducts: stats?.totalProducts ?? 0,
        totalQuantity: stats?.totalQuantity ?? 0,
      };
    });

    return { result };
  }
}
