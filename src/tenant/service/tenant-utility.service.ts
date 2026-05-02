import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Designation } from 'src/tenant-db/entities/user.entity';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { Region } from 'src/tenant-db/entities/region.entity';
import { Area } from 'src/tenant-db/entities/area.entity';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { Flavour, Product, ProductBrand, ProductCategory, Uom } from 'src/tenant-db/entities/product.entity';
import { RetailerCategory, RetailerChannel } from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';

@Injectable()
export class TenantUtilityService {
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

  async getDistributors(tenantDb: DataSource, areaId: string) {
    const distributors = await tenantDb.getRepository(Distributor).find({
      where: { area: { id: areaId }},
      select: ['id', 'name', 'code'],
      order: { name: 'ASC' },
    });

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
        category: {
          id: true,
          name: true,
        },
      },
      relations: {
        pricing: true,
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
}
