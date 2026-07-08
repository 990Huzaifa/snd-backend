import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { PJP, PJPRoute, PJPStatus } from 'src/tenant-db/entities/pjp.entity';
import { Retailer, RetailerCategory, RetailerChannel } from 'src/tenant-db/entities/retailer.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { SalesmanDistributor } from 'src/tenant-db/entities/user.entity';

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

@Injectable()
export class MerchandiserSyncDownService {

  private normalizeDistributorId(distributorId?: string): string {
    const normalized = (distributorId ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('distributorId is required');
    }
    return normalized;
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

  async listRetailerCategories(tenantDb: DataSource) {
    const categories = await tenantDb.getRepository(RetailerCategory).find({
      order: { name: 'ASC' },
    });
    return { result: categories };
  }

  async listRetailerChannels(tenantDb: DataSource) {
    const channels = await tenantDb.getRepository(RetailerChannel).find({
      order: { name: 'ASC' },
    });
    return { result: channels };
  }
}
