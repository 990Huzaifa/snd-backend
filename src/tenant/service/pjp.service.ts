import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { PJP, PJPRoute, PJPStatus } from 'src/tenant-db/entities/pjp.entity';
import { Route } from 'src/tenant-db/entities/route.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import { ActivityLogService } from './activity-log.service';
import { CreatePjpDto } from '../dto/pjp/create-pjp.dto';
import { UpdatePjpDto } from '../dto/pjp/update-pjp.dto';
import { AssignPjpDto } from '../dto/pjp/assign-pjp.dto';

@Injectable()
export class PjpService {
  private readonly logger = new Logger(PjpService.name);

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private async ensureSalesman(tenantDb: DataSource, salesmanId?: string | null) {
    if (!salesmanId) {
      return null;
    }
    const salesman = await tenantDb.getRepository(User).findOne({
      where: { id: salesmanId, isDeleted: false },
    });
    if (!salesman) {
      throw new NotFoundException('Salesman not found');
    }
    return salesman;
  }

  private async ensureRoutes(tenantDb: DataSource, routeIds: string[]) {
    const routeRepo = tenantDb.getRepository(Route);
    const uniqueIds = [...new Set(routeIds)];
    const routes = await routeRepo.findBy({ id: In(uniqueIds) });
    if (routes.length !== uniqueIds.length) {
      throw new NotFoundException('One or more routes not found');
    }
  }

  private async findOverlap(
    tenantDb: DataSource,
    weekStartDate: Date,
    weekEndDate: Date,
    salesmanId?: string | null,
    ignorePjpId?: string,
  ) {
    if (!salesmanId) {
      return null;
    }
    const pjpRepo = tenantDb.getRepository(PJP);
    const query = pjpRepo
      .createQueryBuilder('pjp')
      .where('pjp.salesmanId = :salesmanId', { salesmanId })
      .andWhere(
        '((pjp.weekStartDate <= :weekEndDate AND pjp.weekEndDate >= :weekStartDate))',
        { weekStartDate, weekEndDate },
      );

    if (ignorePjpId) {
      query.andWhere('pjp.id != :ignorePjpId', { ignorePjpId });
    }

    return query.getOne();
  }

  private async ensureNoOverlap(
    tenantDb: DataSource,
    weekStartDate: Date,
    weekEndDate: Date,
    salesmanId?: string | null,
    ignorePjpId?: string,
  ) {
    const overlapped = await this.findOverlap(
      tenantDb,
      weekStartDate,
      weekEndDate,
      salesmanId,
      ignorePjpId,
    );
    if (overlapped) {
      throw new ConflictException(
        'Salesman already has a PJP assigned for this date range',
      );
    }
  }

  async create(tenantDb: DataSource, dto: CreatePjpDto, user: any) {
    const pjpRepo = tenantDb.getRepository(PJP);
    const pjpRouteRepo = tenantDb.getRepository(PJPRoute);
    const weekStartDate = new Date(dto.weekStartDate);
    const weekEndDate = new Date(dto.weekEndDate);

    if (weekEndDate < weekStartDate) {
      throw new ConflictException('weekEndDate must be greater than weekStartDate');
    }

    await this.ensureSalesman(tenantDb, dto.salesmanId ?? null);
    await this.ensureNoOverlap(
      tenantDb,
      weekStartDate,
      weekEndDate,
      dto.salesmanId ?? null,
    );
    await this.ensureRoutes(
      tenantDb,
      dto.routes.map((item) => item.routeId),
    );

    const pjp = await pjpRepo.save(
      pjpRepo.create({
        weekStartDate,
        weekEndDate,
        salesmanId: dto.salesmanId ?? null,
        status: dto.salesmanId ? PJPStatus.ACTIVE : PJPStatus.PENDING,
      }),
    );

    await pjpRouteRepo.save(
      dto.routes.map((item) =>
        pjpRouteRepo.create({
          pjpId: pjp.id,
          routeId: item.routeId,
          visitDate: new Date(item.visitDate),
        }),
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PJP_CREATED',
      description: 'PJP created',
      metadata: {
        pjpId: pjp.id,
        salesmanId: pjp.salesmanId,
        routeCount: dto.routes.length,
        status: pjp.status.toString(),
      },
    });

    return this.view(tenantDb, pjp.id, user);
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    salesmanId: string | undefined,
    status: string | undefined,
    user: any,
  ) {
    const query = tenantDb
      .getRepository(PJP)
      .createQueryBuilder('pjp')
      .leftJoinAndSelect('pjp.salesman', 'salesman')
      .where('1=1');

    const normalizedSearch = search.trim();
    if (normalizedSearch) {
      query.andWhere(
        new Brackets((subQuery) => {
          subQuery
            .where('salesman.name LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('salesman.email LIKE :search', { search: `%${normalizedSearch}%` });
        }),
      );
    }

    if (salesmanId?.trim()) {
      query.andWhere('pjp.salesmanId = :salesmanId', {
        salesmanId: salesmanId.trim(),
      });
    }

    if (status?.trim()) {
      query.andWhere('pjp.status = :status', { status: status.trim() });
    }

    const [plans, total] = await query
      .orderBy('pjp.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PJP_LISTED',
      description: 'PJP plans listed',
      metadata: { total, page, limit, salesmanId: salesmanId || null, status: status || null },
    });

    return { result: plans, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const pjp = await tenantDb.getRepository(PJP).findOne({
      where: { id },
      relations: ['salesman'],
    });
    if (!pjp) {
      throw new NotFoundException('PJP not found');
    }

    const routes = await tenantDb.getRepository(PJPRoute).find({
      where: { pjpId: pjp.id },
      relations: ['route', 'route.area', 'route.distributor'],
      order: { visitDate: 'ASC' },
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PJP_VIEWED',
      description: 'PJP viewed',
      metadata: { pjpId: pjp.id },
    });

    return {
      ...pjp,
      routes,
    };
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdatePjpDto, user: any) {
    const pjpRepo = tenantDb.getRepository(PJP);
    const pjpRouteRepo = tenantDb.getRepository(PJPRoute);
    const pjp = await pjpRepo.findOne({ where: { id } });
    if (!pjp) {
      throw new NotFoundException('PJP not found');
    }

    const nextWeekStartDate = dto.weekStartDate
      ? new Date(dto.weekStartDate)
      : pjp.weekStartDate;
    const nextWeekEndDate = dto.weekEndDate ? new Date(dto.weekEndDate) : pjp.weekEndDate;

    if (nextWeekEndDate < nextWeekStartDate) {
      throw new ConflictException('weekEndDate must be greater than weekStartDate');
    }

    await this.ensureNoOverlap(
      tenantDb,
      nextWeekStartDate,
      nextWeekEndDate,
      pjp.salesmanId,
      pjp.id,
    );

    pjp.weekStartDate = nextWeekStartDate;
    pjp.weekEndDate = nextWeekEndDate;
    await pjpRepo.save(pjp);

    if (dto.routes) {
      await this.ensureRoutes(
        tenantDb,
        dto.routes.map((item) => item.routeId),
      );
      await pjpRouteRepo.delete({ pjpId: pjp.id });
      await pjpRouteRepo.save(
        dto.routes.map((item) =>
          pjpRouteRepo.create({
            pjpId: pjp.id,
            routeId: item.routeId,
            visitDate: new Date(item.visitDate),
          }),
        ),
      );
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PJP_UPDATED',
      description: 'PJP updated',
      metadata: { pjpId: pjp.id },
    });

    return this.view(tenantDb, pjp.id, user);
  }

  async assign(tenantDb: DataSource, id: string, dto: AssignPjpDto, user: any) {
    const pjpRepo = tenantDb.getRepository(PJP);
    const pjp = await pjpRepo.findOne({ where: { id } });
    if (!pjp) {
      throw new NotFoundException('PJP not found');
    }

    await this.ensureSalesman(tenantDb, dto.userId);
    await this.ensureNoOverlap(
      tenantDb,
      pjp.weekStartDate,
      pjp.weekEndDate,
      dto.userId,
      pjp.id,
    );

    pjp.salesmanId = dto.userId;
    pjp.status = PJPStatus.ACTIVE;
    await pjpRepo.save(pjp);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PJP_ASSIGNED',
      description: 'PJP assigned to salesman',
      metadata: { pjpId: pjp.id, salesmanId: pjp.salesmanId, status: pjp.status },
    });

    return this.view(tenantDb, pjp.id, user);
  }

  async unassign(tenantDb: DataSource, id: string, user: any) {
    const pjpRepo = tenantDb.getRepository(PJP);
    const pjp = await pjpRepo.findOne({ where: { id } });
    if (!pjp) {
      throw new NotFoundException('PJP not found');
    }
    if (!pjp.salesmanId) {
      throw new ConflictException('PJP is already unassigned');
    }

    const previousSalesmanId = pjp.salesmanId;
    pjp.salesmanId = null;
    pjp.status = PJPStatus.PENDING;
    await pjpRepo.save(pjp);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PJP_UNASSIGNED',
      description: 'PJP unassigned from user',
      metadata: {
        pjpId: pjp.id,
        previousSalesmanId,
        status: pjp.status,
      },
    });

    return this.view(tenantDb, pjp.id, user);
  }

  async delete(tenantDb: DataSource, id: string, user: any) {
    const pjpRepo = tenantDb.getRepository(PJP);
    const pjp = await pjpRepo.findOne({ where: { id } });
    if (!pjp) {
      throw new NotFoundException('PJP not found');
    }

    await pjpRepo.delete(pjp.id);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PJP_DELETED',
      description: 'PJP deleted',
      metadata: { pjpId: pjp.id },
    });
    return { message: 'PJP deleted successfully' };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async rolloverExpiredPjpsCron() {
    const tenants = await this.tenantRepo.find({
      where: { isActive: true },
      select: { id: true, code: true },
    });

    for (const tenant of tenants) {
      try {
        const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
        await this.rolloverExpiredPjps(tenantDb);
      } catch (error) {
        this.logger.error(
          `PJP week rollover cron failed for tenant ${tenant.code}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async rolloverExpiredPjps(tenantDb: DataSource) {
    const now = new Date();
    const pjpRepo = tenantDb.getRepository(PJP);
    const pjpRouteRepo = tenantDb.getRepository(PJPRoute);

    const expired = await pjpRepo
      .createQueryBuilder('pjp')
      .where('pjp.status = :status', { status: PJPStatus.ACTIVE })
      .andWhere('pjp.salesmanId IS NOT NULL')
      .andWhere('pjp.weekEndDate < :now', { now })
      .getMany();

    for (const pjp of expired) {
      try {
        const oldWeekStartDate = new Date(pjp.weekStartDate);
        const oldWeekEndDate = new Date(pjp.weekEndDate);

        let weeksToShift = 0;
        let nextStart = new Date(pjp.weekStartDate);
        let nextEnd = new Date(pjp.weekEndDate);
        while (nextEnd.getTime() < now.getTime()) {
          nextStart = this.addDays(nextStart, 7);
          nextEnd = this.addDays(nextEnd, 7);
          weeksToShift += 1;
        }

        if (weeksToShift === 0) {
          continue;
        }

        const overlapped = await this.findOverlap(
          tenantDb,
          nextStart,
          nextEnd,
          pjp.salesmanId,
          pjp.id,
        );
        if (overlapped) {
          this.logger.warn(
            `Skipping PJP ${pjp.id} rollover due to overlap with PJP ${overlapped.id}`,
          );
          continue;
        }

        const daysToShift = weeksToShift * 7;
        pjp.weekStartDate = nextStart;
        pjp.weekEndDate = nextEnd;
        await pjpRepo.save(pjp);

        const routes = await pjpRouteRepo.find({ where: { pjpId: pjp.id } });
        for (const route of routes) {
          route.visitDate = this.addDays(route.visitDate, daysToShift);
        }
        if (routes.length) {
          await pjpRouteRepo.save(routes);
        }

        await this.activityLogService.recordActivityLog(tenantDb, {
          actorId: pjp.salesmanId as string,
          action: 'PJP_WEEK_ROLLED',
          description: 'PJP week dates rolled to next period',
          metadata: {
            pjpId: pjp.id,
            salesmanId: pjp.salesmanId,
            weeksShifted: weeksToShift,
            oldWeekStartDate: oldWeekStartDate.toISOString(),
            oldWeekEndDate: oldWeekEndDate.toISOString(),
            newWeekStartDate: nextStart.toISOString(),
            newWeekEndDate: nextEnd.toISOString(),
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to roll over PJP ${pjp.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }
}
