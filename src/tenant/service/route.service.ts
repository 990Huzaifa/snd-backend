import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { Route } from 'src/tenant-db/entities/route.entity';
import { Area } from 'src/tenant-db/entities/area.entity';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateRouteDto } from '../dto/route/create-route.dto';
import { UpdateRouteDto } from '../dto/route/update-route.dto';

@Injectable()
export class RouteService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private normalize(value: string) {
    return value.trim();
  }

  private async validateRefs(
    tenantDb: DataSource,
    areaId?: string,
    distributorId?: string,
  ) {
    const areaRepo = tenantDb.getRepository(Area);
    const distributorRepo = tenantDb.getRepository(Distributor);

    const [area, distributor] = await Promise.all([
      areaId ? areaRepo.findOne({ where: { id: areaId.trim() } }) : Promise.resolve(null),
      distributorId
        ? distributorRepo.findOne({
            where: { id: distributorId.trim(), isDeleted: false },
          })
        : Promise.resolve(null),
    ]);

    if (areaId && !area) {
      throw new NotFoundException('Area not found');
    }
    if (distributorId && !distributor) {
      throw new NotFoundException('Distributor not found');
    }

    return { area, distributor };
  }

  async create(tenantDb: DataSource, dto: CreateRouteDto, user: any) {
    const routeRepo = tenantDb.getRepository(Route);
    const normalizedName = this.normalize(dto.name);

    const { area, distributor } = await this.validateRefs(
      tenantDb,
      dto.areaId,
      dto.distributorId,
    );

    const existingRoute = await routeRepo.findOne({
      where: {
        areaId: area!.id,
        distributorId: distributor!.id,
        name: normalizedName,
      },
    });

    if (existingRoute) {
      throw new ConflictException(
        'Route with this name already exists for selected area and distributor',
      );
    }

    const createdRoute = await routeRepo.save(
      routeRepo.create({
        areaId: area!.id,
        distributorId: distributor!.id,
        name: normalizedName,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ROUTE_CREATED',
      description: `Route ${createdRoute.name} created`,
      metadata: { routeId: createdRoute.id, areaId: createdRoute.areaId, distributorId: createdRoute.distributorId },
    });

    return createdRoute;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    areaId: string | undefined,
    distributorId: string | undefined,
    user: any,
  ) {

    const query = tenantDb
      .getRepository(Route)
      .createQueryBuilder('route')
      .leftJoinAndSelect('route.area', 'area')
      .leftJoinAndSelect('route.distributor', 'distributor')
      .where('1=1');

    const normalizedSearch = search.trim();
    if (normalizedSearch) {
      query.andWhere(
        new Brackets((subQuery) => {
          subQuery
            .where('route.name LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('area.name LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('distributor.name LIKE :search', {
              search: `%${normalizedSearch}%`,
            });
        }),
      );
    }

    if (areaId?.trim()) {
      query.andWhere('route.areaId = :areaId', { areaId: areaId.trim() });
    }

    if (distributorId?.trim()) {
      query.andWhere('route.distributorId = :distributorId', {
        distributorId: distributorId.trim(),
      });
    }

    const [routes, total] = await query
      .orderBy('route.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ROUTE_LISTED',
      description: 'Routes listed',
      metadata: {
        total,
        page,
        limit,
        areaId: areaId || null,
        distributorId: distributorId || null,
      },
    });

    return { result: routes, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const route = await tenantDb.getRepository(Route).findOne({
      where: { id },
      relations: ['area', 'distributor'],
    });

    if (!route) {
      throw new NotFoundException('Route not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ROUTE_VIEWED',
      description: `Route ${route.name} viewed`,
      metadata: { routeId: route.id },
    });

    return route;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateRouteDto, user: any) {
    const routeRepo = tenantDb.getRepository(Route);
    const route = await routeRepo.findOne({ where: { id } });

    if (!route) {
      throw new NotFoundException('Route not found');
    }

    if (dto.areaId !== undefined || dto.distributorId !== undefined) {
      const refs = await this.validateRefs(
        tenantDb,
        dto.areaId ?? route.areaId,
        dto.distributorId ?? route.distributorId,
      );
      if (dto.areaId !== undefined) {
        route.areaId = refs.area!.id;
      }
      if (dto.distributorId !== undefined) {
        route.distributorId = refs.distributor!.id;
      }
    }

    if (dto.name !== undefined) {
      route.name = this.normalize(dto.name);
    }

    const duplicateRoute = await routeRepo.findOne({
      where: {
        areaId: route.areaId,
        distributorId: route.distributorId,
        name: route.name,
      },
    });

    if (duplicateRoute && duplicateRoute.id !== route.id) {
      throw new ConflictException(
        'Route with this name already exists for selected area and distributor',
      );
    }

    await routeRepo.save(route);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'ROUTE_UPDATED',
      description: `Route ${route.name} updated`,
      metadata: { routeId: route.id, areaId: route.areaId, distributorId: route.distributorId },
    });

    return route;
  }
}
