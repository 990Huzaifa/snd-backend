import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
    MetricType,
    TargetAchievementSnapshotEntity,
    TargetMetricEntity,
    TargetMetricItemEntity,
    TargetPlanAssigneeEntity,
    TargetPlanAssigneeStatus,
    TargetPlanEntity,
    TargetPlanStatus,
} from 'src/tenant-db/entities/target-plan.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { Product, ProductCategory } from 'src/tenant-db/entities/product.entity';
import {
    OrderStatus,
    SaleOrder,
    SaleOrderItem,
} from 'src/tenant-db/entities/saleorder.entity';
import { Retailer, RetailerVisit } from 'src/tenant-db/entities/retailer.entity';
import { ActivityLogService } from './activity-log.service';
import { MasterGeoHelperService } from './master-geo-helper.service';
import {
    CreateTargetPlanAssigneeDto,
    CreateTargetPlanDto,
    CreateTargetMetricDto,
} from '../dto/target-plan/create-target-plan.dto';
import { UpdateTargetPlanDto } from '../dto/target-plan/update-target-plan.dto';
import { ListTargetPlanDto } from '../dto/target-plan/list-target-plan.dto';
import { UpdateTargetPlanStatusDto } from '../dto/target-plan/update-target-plan-status.dto';
import { AssignTargetPlanDto } from '../dto/target-plan/assign-target-plan.dto';
import { RemoveTargetPlanAssigneesDto } from '../dto/target-plan/remove-target-plan-assignees.dto';

type AssigneeInput = CreateTargetPlanAssigneeDto;

const COUNTABLE_SALE_ORDER_STATUSES = [
    OrderStatus.APPROVED,
    OrderStatus.PROCESSING,
    OrderStatus.DELIVERED,
] as const;

@Injectable()
export class TargetPlanService {
    constructor(
        private readonly activityLogService: ActivityLogService,
        private readonly masterGeoHelperService: MasterGeoHelperService,
    ) {}

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

    private parseDate(value: string, label: string): Date {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new BadRequestException(`Invalid ${label}`);
        }
        return date;
    }

    private parseOptionalDate(value?: string): Date | undefined {
        if (!value?.trim()) {
            return undefined;
        }
        const date = new Date(value.trim());
        if (Number.isNaN(date.getTime())) {
            throw new BadRequestException(`Invalid date: ${value}`);
        }
        return date;
    }

    private parseOptionalStatus(value?: string): TargetPlanStatus | undefined {
        const normalized = value?.trim();
        if (!normalized) {
            return undefined;
        }
        if (!(Object.values(TargetPlanStatus) as string[]).includes(normalized)) {
            throw new BadRequestException(
                `Invalid status filter (use one of: ${Object.values(TargetPlanStatus).join(', ')})`,
            );
        }
        return normalized as TargetPlanStatus;
    }

    private validateDateRange(startDate: Date, endDate: Date) {
        if (endDate < startDate) {
            throw new BadRequestException('endDate must be greater than or equal to startDate');
        }
    }

    private ensureDraft(plan: TargetPlanEntity) {
        if (plan.status !== TargetPlanStatus.DRAFT) {
            throw new BadRequestException('Target plan can only be edited while status is DRAFT');
        }
    }

    private ensureAssignableStatus(plan: TargetPlanEntity) {
        if (
            plan.status === TargetPlanStatus.LOCKED ||
            plan.status === TargetPlanStatus.CLOSED ||
            plan.status === TargetPlanStatus.CANCELLED
        ) {
            throw new BadRequestException(
                'Assignees cannot be changed while plan is LOCKED, CLOSED, or CANCELLED',
            );
        }
    }

    private async ensureCityExists(cityId: string): Promise<string> {
        const cityName = await this.masterGeoHelperService.getCityNameById(cityId);
        if (!cityName) {
            throw new NotFoundException('City not found');
        }
        return cityName;
    }

    private async generatePlanName(cityId: string, startDate: Date): Promise<string> {
        const cityName = await this.ensureCityExists(cityId);
        const month = startDate.toLocaleString('en-US', { month: 'long' });
        const year = startDate.getFullYear();
        return `${month} ${year} ${cityName} Target`;
    }

    private async ensureAssigneesValid(
        tenantDb: DataSource,
        assignees: AssigneeInput[],
        existingPlanId?: string,
    ) {
        if (!assignees.length) {
            return;
        }

        const seen = new Set<string>();
        for (const item of assignees) {
            if (seen.has(item.assigneeId)) {
                throw new ConflictException('Duplicate assignee in request');
            }
            seen.add(item.assigneeId);
        }

        const users = await tenantDb.getRepository(User).find({
            where: { id: In(assignees.map((a) => a.assigneeId)), isDeleted: false },
        });
        if (users.length !== assignees.length) {
            throw new NotFoundException('One or more assignees not found');
        }

        const userMap = new Map(users.map((u) => [u.id, u]));
        for (const item of assignees) {
            const user = userMap.get(item.assigneeId)!;
            if (user.type !== item.userType) {
                throw new BadRequestException(
                    `Assignee ${user.name} does not match user type ${item.userType}`,
                );
            }
        }

        if (existingPlanId) {
            const activeDuplicates = await tenantDb.getRepository(TargetPlanAssigneeEntity).count({
                where: {
                    targetPlanId: existingPlanId,
                    assigneeId: In(assignees.map((a) => a.assigneeId)),
                    status: TargetPlanAssigneeStatus.ACTIVE,
                },
            });
            if (activeDuplicates > 0) {
                throw new ConflictException('One or more assignees are already active on this plan');
            }
        }
    }

    private async ensureMetricsValid(tenantDb: DataSource, metrics: CreateTargetMetricDto[]) {
        if (!metrics.length) {
            throw new BadRequestException('At least one metric is required');
        }

        const productIds: string[] = [];
        const categoryIds: string[] = [];

        for (const metric of metrics) {
            switch (metric.metricType) {
                case MetricType.PRODUCT_QTY: {
                    if (!metric.items?.length) {
                        throw new BadRequestException('PRODUCT_QTY metrics require at least one item');
                    }
                    for (const item of metric.items) {
                        if (!item.productId) {
                            throw new BadRequestException('PRODUCT_QTY item requires productId');
                        }
                        if ((item.targetQuantity ?? 0) <= 0) {
                            throw new BadRequestException('PRODUCT_QTY item requires targetQuantity > 0');
                        }
                        productIds.push(item.productId);
                    }
                    break;
                }
                case MetricType.CATEGORY_QTY: {
                    if (!metric.items?.length) {
                        throw new BadRequestException('CATEGORY_QTY metrics require at least one item');
                    }
                    for (const item of metric.items) {
                        if (!item.categoryId) {
                            throw new BadRequestException('CATEGORY_QTY item requires categoryId');
                        }
                        categoryIds.push(item.categoryId);
                    }
                    break;
                }
                case MetricType.SALES_VALUE:
                case MetricType.RETAILER_VISITS:
                case MetricType.NEW_RETAILERS: {
                    if (metric.items?.length) {
                        throw new BadRequestException(`${metric.metricType} metrics must not include items`);
                    }
                    if (metric.targetValue <= 0) {
                        throw new BadRequestException(`${metric.metricType} requires targetValue > 0`);
                    }
                    break;
                }
            }
        }

        if (productIds.length) {
            const count = await tenantDb.getRepository(Product).count({
                where: { id: In([...new Set(productIds)]) },
            });
            if (count !== new Set(productIds).size) {
                throw new NotFoundException('One or more products not found');
            }
        }

        if (categoryIds.length) {
            const count = await tenantDb.getRepository(ProductCategory).count({
                where: { id: In([...new Set(categoryIds)]) },
            });
            if (count !== new Set(categoryIds).size) {
                throw new NotFoundException('One or more product categories not found');
            }
        }
    }

    private async saveMetrics(
        manager: EntityManager,
        planId: string,
        metrics: CreateTargetMetricDto[],
    ) {
        const metricRepo = manager.getRepository(TargetMetricEntity);
        const itemRepo = manager.getRepository(TargetMetricItemEntity);

        for (const metricDto of metrics) {
            const metric = await metricRepo.save(
                metricRepo.create({
                    targetPlanId: planId,
                    metricType: metricDto.metricType,
                    targetValue: metricDto.targetValue,
                }),
            );

            if (metricDto.items?.length) {
                await itemRepo.save(
                    metricDto.items.map((item) =>
                        itemRepo.create({
                            targetMetricId: metric.id,
                            metricType: metricDto.metricType,
                            productId: item.productId ?? null,
                            categoryId: item.categoryId ?? null,
                            targetQuantity: item.targetQuantity ?? 0,
                            targetAmount: item.targetAmount ?? 0,
                        }),
                    ),
                );
            }
        }
    }

    private async replaceMetrics(
        manager: EntityManager,
        planId: string,
        metrics: CreateTargetMetricDto[],
    ) {
        await manager.getRepository(TargetMetricEntity).delete({ targetPlanId: planId });
        await this.saveMetrics(manager, planId, metrics);
    }

    private async saveAssignees(
        manager: EntityManager,
        planId: string,
        assignees: AssigneeInput[],
    ) {
        if (!assignees.length) {
            return;
        }

        const assigneeRepo = manager.getRepository(TargetPlanAssigneeEntity);

        for (const item of assignees) {
            const existing = await assigneeRepo.findOne({
                where: { targetPlanId: planId, assigneeId: item.assigneeId },
            });

            if (existing) {
                existing.userType = item.userType;
                existing.status = TargetPlanAssigneeStatus.ACTIVE;
                await assigneeRepo.save(existing);
                continue;
            }

            await assigneeRepo.save(
                assigneeRepo.create({
                    targetPlanId: planId,
                    userType: item.userType,
                    assigneeId: item.assigneeId,
                    status: TargetPlanAssigneeStatus.ACTIVE,
                }),
            );
        }
    }

    private async getPlanOrThrow(tenantDb: DataSource, id: string): Promise<TargetPlanEntity> {
        const plan = await tenantDb.getRepository(TargetPlanEntity).findOne({ where: { id } });
        if (!plan) {
            throw new NotFoundException('Target plan not found');
        }
        return plan;
    }

    async create(tenantDb: DataSource, dto: CreateTargetPlanDto, user: { userId: string }) {
        const startDate = this.parseDate(dto.startDate, 'startDate');
        const endDate = this.parseDate(dto.endDate, 'endDate');
        this.validateDateRange(startDate, endDate);
        await this.ensureMetricsValid(tenantDb, dto.metrics);
        if (dto.assignees?.length) {
            await this.ensureAssigneesValid(tenantDb, dto.assignees);
        }

        const name = await this.generatePlanName(dto.cityId, startDate);

        const planId = await tenantDb.transaction(async (manager) => {
            const planRepo = manager.getRepository(TargetPlanEntity);
            const plan = await planRepo.save(
                planRepo.create({
                    name,
                    cityId: dto.cityId,
                    startDate,
                    endDate,
                    status: TargetPlanStatus.DRAFT,
                }),
            );

            if (dto.assignees?.length) {
                await this.saveAssignees(manager, plan.id, dto.assignees);
            }
            await this.saveMetrics(manager, plan.id, dto.metrics);
            return plan.id;
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TARGET_PLAN_CREATED',
            description: `Target plan ${name} created`,
            metadata: { targetPlanId: planId },
        });

        return this.view(tenantDb, planId, user);
    }

    async list(tenantDb: DataSource, query: ListTargetPlanDto, user: { userId: string }) {
        const page = this.normalizePage(query.page);
        const limit = this.normalizeLimit(query.limit);
        const status = this.parseOptionalStatus(query.status);
        const dateFrom = this.parseOptionalDate(query.dateFrom);
        const dateTo = this.parseOptionalDate(query.dateTo);
        const search = query.search?.trim() ?? '';

        const qb = tenantDb
            .getRepository(TargetPlanEntity)
            .createQueryBuilder('plan')
            .where('1=1');

        if (search) {
            qb.andWhere('plan.name ILIKE :search', { search: `%${search}%` });
        }
        if (status) {
            qb.andWhere('plan.status = :status', { status });
        }
        if (query.cityId) {
            qb.andWhere('plan.cityId = :cityId', { cityId: query.cityId });
        }
        if (dateFrom) {
            qb.andWhere('plan.endDate >= :dateFrom', { dateFrom });
        }
        if (dateTo) {
            qb.andWhere('plan.startDate <= :dateTo', { dateTo });
        }
        if (query.assigneeId) {
            qb.andWhere(
                `EXISTS (
          SELECT 1 FROM target_plan_assignees assignee
          WHERE assignee."targetPlanId" = plan.id
            AND assignee."assigneeId" = :assigneeId
            AND assignee.status = :activeStatus
        )`,
                {
                    assigneeId: query.assigneeId,
                    activeStatus: TargetPlanAssigneeStatus.ACTIVE,
                },
            );
        }

        qb.orderBy('plan.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        const [rows, total] = await qb.getManyAndCount();

        if (!rows.length) {
            return {
                result: [],
                meta: { total, page, limit },
            };
        }

        const planIds = rows.map((plan) => plan.id);

        const [assignees, metricCountRows] = await Promise.all([
            tenantDb.getRepository(TargetPlanAssigneeEntity).find({
                where: {
                    targetPlanId: In(planIds),
                    status: TargetPlanAssigneeStatus.ACTIVE,
                },
                relations: ['assignee'],
                order: { createdAt: 'ASC' },
            }),
            tenantDb
                .getRepository(TargetMetricEntity)
                .createQueryBuilder('metric')
                .select('metric.targetPlanId', 'targetPlanId')
                .addSelect('COUNT(metric.id)', 'count')
                .where('metric.targetPlanId IN (:...planIds)', { planIds })
                .groupBy('metric.targetPlanId')
                .getRawMany<{ targetPlanId: string; count: string }>(),
        ]);

        const assigneesByPlanId = new Map<string, TargetPlanAssigneeEntity[]>();
        for (const assignee of assignees) {
            const existing = assigneesByPlanId.get(assignee.targetPlanId) ?? [];
            existing.push(assignee);
            assigneesByPlanId.set(assignee.targetPlanId, existing);
        }

        const metricCountByPlanId = new Map(
            metricCountRows.map((row) => [row.targetPlanId, Number(row.count)]),
        );

        const result = await Promise.all(
            rows.map(async (plan) => {
                const cityName = await this.masterGeoHelperService.getCityNameById(plan.cityId);
                const planAssignees = assigneesByPlanId.get(plan.id) ?? [];
                const assigneeNames = planAssignees
                    .map((assignee) => assignee.assignee?.name)
                    .filter((name): name is string => Boolean(name));

                return {
                    ...plan,
                    cityName,
                    assigneeCount: planAssignees.length,
                    assigneeNames,
                    metricCount: metricCountByPlanId.get(plan.id) ?? 0,
                };
            }),
        );

        return {
            result,
            meta: { total, page, limit },
        };
    }

    async view(tenantDb: DataSource, id: string, user: { userId: string }) {
        const plan = await tenantDb.getRepository(TargetPlanEntity).findOne({
            where: { id },
            relations: [
                'assignees',
                'assignees.assignee',
                'metrics',
                'metrics.items',
                'metrics.items.product',
                'metrics.items.category',
            ],
            order: {
                assignees: { createdAt: 'ASC' },
                metrics: { createdAt: 'ASC' },
            },
        });

        if (!plan) {
            throw new NotFoundException('Target plan not found');
        }

        const assigneeIds = plan.assignees.map((a) => a.id);
        let snapshots: TargetAchievementSnapshotEntity[] = [];
        if (assigneeIds.length) {
            snapshots = await tenantDb.getRepository(TargetAchievementSnapshotEntity).find({
                where: { targetAssigneeId: In(assigneeIds) },
                relations: ['targetAssignee', 'targetAssignee.assignee', 'targetMetric'],
                order: { calculatedAt: 'DESC' },
            });
        }

        const cityName = await this.masterGeoHelperService.getCityNameById(plan.cityId);

        return {
            ...plan,
            cityName,
            snapshots,
        };
    }

    async edit(tenantDb: DataSource, id: string, dto: UpdateTargetPlanDto, user: { userId: string }) {
        const existing = await this.getPlanOrThrow(tenantDb, id);
        this.ensureDraft(existing);

        const startDate = dto.startDate ? this.parseDate(dto.startDate, 'startDate') : existing.startDate;
        const endDate = dto.endDate ? this.parseDate(dto.endDate, 'endDate') : existing.endDate;
        const cityId = dto.cityId ?? existing.cityId;

        this.validateDateRange(startDate, endDate);
        if (dto.metrics) {
            await this.ensureMetricsValid(tenantDb, dto.metrics);
        }

        const shouldRegenerateName =
            cityId !== existing.cityId ||
            startDate.getTime() !== new Date(existing.startDate).getTime();
        const name = shouldRegenerateName
            ? await this.generatePlanName(cityId, startDate)
            : existing.name;

        await tenantDb.transaction(async (manager) => {
            await manager.getRepository(TargetPlanEntity).update(id, {
                name,
                cityId,
                startDate,
                endDate,
            });
            if (dto.metrics) {
                await this.replaceMetrics(manager, id, dto.metrics);
            }
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TARGET_PLAN_UPDATED',
            description: `Target plan ${name} updated`,
            metadata: { targetPlanId: id },
        });

        return this.view(tenantDb, id, user);
    }

    async assignAssignees(
        tenantDb: DataSource,
        id: string,
        dto: AssignTargetPlanDto,
        user: { userId: string },
    ) {
        const plan = await this.getPlanOrThrow(tenantDb, id);
        this.ensureAssignableStatus(plan);
        await this.ensureAssigneesValid(tenantDb, dto.assignees, id);

        await tenantDb.transaction(async (manager) => {
            await this.saveAssignees(manager, id, dto.assignees);
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TARGET_PLAN_ASSIGNEES_ADDED',
            description: `Assignees added to target plan ${plan.name}`,
            metadata: { targetPlanId: id, assigneeIds: dto.assignees.map((a) => a.assigneeId) },
        });

        return this.view(tenantDb, id, user);
    }

    async removeAssignees(
        tenantDb: DataSource,
        id: string,
        dto: RemoveTargetPlanAssigneesDto,
        user: { userId: string },
    ) {
        const plan = await this.getPlanOrThrow(tenantDb, id);
        this.ensureAssignableStatus(plan);

        const assigneeRepo = tenantDb.getRepository(TargetPlanAssigneeEntity);
        const rows = await assigneeRepo.find({
            where: {
                targetPlanId: id,
                assigneeId: In(dto.assigneeIds),
                status: TargetPlanAssigneeStatus.ACTIVE,
            },
        });

        if (!rows.length) {
            throw new NotFoundException('No active assignees found for removal');
        }

        await assigneeRepo.update(
            { id: In(rows.map((r) => r.id)) },
            { status: TargetPlanAssigneeStatus.REMOVED },
        );

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TARGET_PLAN_ASSIGNEES_REMOVED',
            description: `Assignees removed from target plan ${plan.name}`,
            metadata: { targetPlanId: id, assigneeIds: dto.assigneeIds },
        });

        return this.view(tenantDb, id, user);
    }

    async updateStatus(
        tenantDb: DataSource,
        id: string,
        dto: UpdateTargetPlanStatusDto,
        user: { userId: string },
    ) {
        const transitionMap: Record<TargetPlanStatus, TargetPlanStatus[]> = {
            [TargetPlanStatus.DRAFT]: [TargetPlanStatus.PUBLISHED, TargetPlanStatus.CANCELLED],
            [TargetPlanStatus.PUBLISHED]: [TargetPlanStatus.LOCKED, TargetPlanStatus.CANCELLED],
            [TargetPlanStatus.LOCKED]: [TargetPlanStatus.CLOSED, TargetPlanStatus.CANCELLED],
            [TargetPlanStatus.CLOSED]: [],
            [TargetPlanStatus.CANCELLED]: [],
        };

        const outcome = await tenantDb.transaction(async (manager) => {
            const repo = manager.getRepository(TargetPlanEntity);
            const plan = await repo.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!plan) {
                throw new NotFoundException('Target plan not found');
            }

            if (plan.status === dto.status) {
                return 'noop';
            }

            const allowed = transitionMap[plan.status] ?? [];
            if (!allowed.includes(dto.status)) {
                throw new BadRequestException(
                    `Invalid status transition from ${plan.status} to ${dto.status}`,
                );
            }

            if (dto.status === TargetPlanStatus.PUBLISHED) {
                const activeAssignees = await manager.getRepository(TargetPlanAssigneeEntity).count({
                    where: {
                        targetPlanId: id,
                        status: TargetPlanAssigneeStatus.ACTIVE,
                    },
                });
                if (activeAssignees < 1) {
                    throw new BadRequestException(
                        'At least one active assignee is required to publish',
                    );
                }

                const metricCount = await manager.getRepository(TargetMetricEntity).count({
                    where: { targetPlanId: id },
                });
                if (metricCount < 1) {
                    throw new BadRequestException('At least one metric is required to publish');
                }
            }

            plan.status = dto.status;
            await repo.save(plan);
            return 'updated';
        });

        if (outcome === 'updated') {
            await this.activityLogService.recordActivityLog(tenantDb, {
                actorId: user.userId,
                action: 'TARGET_PLAN_STATUS_UPDATED',
                description: `Target plan status updated to ${dto.status}`,
                metadata: { targetPlanId: id, status: dto.status },
            });
        }

        return this.view(tenantDb, id, user);
    }

    async delete(tenantDb: DataSource, id: string, user: { userId: string }) {
        const plan = await this.getPlanOrThrow(tenantDb, id);
        this.ensureDraft(plan);

        await tenantDb.getRepository(TargetPlanEntity).delete(id);

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TARGET_PLAN_DELETED',
            description: `Target plan ${plan.name} deleted`,
            metadata: { targetPlanId: id },
        });

        return { success: true };
    }

    private endOfDay(date: Date): Date {
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        return end;
    }

    private async computeAchievementValue(
        tenantDb: DataSource,
        metric: TargetMetricEntity,
        assigneeId: string,
        startDate: Date,
        endDate: Date,
    ): Promise<number> {
        const rangeEnd = this.endOfDay(endDate);

        switch (metric.metricType) {
            case MetricType.SALES_VALUE: {
                const result = await tenantDb
                    .getRepository(SaleOrder)
                    .createQueryBuilder('saleOrder')
                    .select('COALESCE(SUM(saleOrder.totalAmount), 0)', 'total')
                    .where('saleOrder.salesmanId = :assigneeId', { assigneeId })
                    .andWhere('saleOrder.orderStatus IN (:...statuses)', {
                        statuses: COUNTABLE_SALE_ORDER_STATUSES,
                    })
                    .andWhere('saleOrder.orderDate >= :startDate', { startDate })
                    .andWhere('saleOrder.orderDate <= :endDate', { endDate: rangeEnd })
                    .getRawOne<{ total: string }>();
                return Number(result?.total ?? 0);
            }
            case MetricType.PRODUCT_QTY: {
                const productIds = (metric.items ?? [])
                    .map((item) => item.productId)
                    .filter((id): id is string => Boolean(id));
                if (!productIds.length) {
                    return 0;
                }
                const result = await tenantDb
                    .getRepository(SaleOrderItem)
                    .createQueryBuilder('item')
                    .innerJoin('item.saleOrder', 'saleOrder')
                    .select('COALESCE(SUM(item.quantity), 0)', 'total')
                    .where('saleOrder.salesmanId = :assigneeId', { assigneeId })
                    .andWhere('saleOrder.orderStatus IN (:...statuses)', {
                        statuses: COUNTABLE_SALE_ORDER_STATUSES,
                    })
                    .andWhere('saleOrder.orderDate >= :startDate', { startDate })
                    .andWhere('saleOrder.orderDate <= :endDate', { endDate: rangeEnd })
                    .andWhere('item.productId IN (:...productIds)', { productIds })
                    .getRawOne<{ total: string }>();
                return Number(result?.total ?? 0);
            }
            case MetricType.CATEGORY_QTY: {
                const categoryIds = (metric.items ?? [])
                    .map((item) => item.categoryId)
                    .filter((id): id is string => Boolean(id));
                if (!categoryIds.length) {
                    return 0;
                }
                const result = await tenantDb
                    .getRepository(SaleOrderItem)
                    .createQueryBuilder('item')
                    .innerJoin('item.saleOrder', 'saleOrder')
                    .innerJoin('item.product', 'product')
                    .select('COALESCE(SUM(item.quantity), 0)', 'total')
                    .where('saleOrder.salesmanId = :assigneeId', { assigneeId })
                    .andWhere('saleOrder.orderStatus IN (:...statuses)', {
                        statuses: COUNTABLE_SALE_ORDER_STATUSES,
                    })
                    .andWhere('saleOrder.orderDate >= :startDate', { startDate })
                    .andWhere('saleOrder.orderDate <= :endDate', { endDate: rangeEnd })
                    .andWhere('product.categoryId IN (:...categoryIds)', { categoryIds })
                    .getRawOne<{ total: string }>();
                return Number(result?.total ?? 0);
            }
            case MetricType.RETAILER_VISITS: {
                return tenantDb
                    .getRepository(RetailerVisit)
                    .createQueryBuilder('visit')
                    .where('visit.userId = :assigneeId', { assigneeId })
                    .andWhere('visit.createdAt >= :startDate', { startDate })
                    .andWhere('visit.createdAt <= :endDate', { endDate: rangeEnd })
                    .getCount();
            }
            case MetricType.NEW_RETAILERS: {
                const count = await tenantDb
                    .getRepository(Retailer)
                    .createQueryBuilder('retailer')
                    .where('retailer.createdBy = :assigneeId', { assigneeId })
                    .andWhere('retailer.createdAt >= :startDate', { startDate })
                    .andWhere('retailer.createdAt <= :endDate', { endDate: rangeEnd })
                    .getCount();
                return count;
            }
            default:
                return 0;
        }
    }

    async recalculateAchievements(
        tenantDb: DataSource,
        id: string,
        user: { userId: string },
    ) {
        const plan = await tenantDb.getRepository(TargetPlanEntity).findOne({
            where: { id },
            relations: ['assignees', 'metrics', 'metrics.items'],
        });
        if (!plan) {
            throw new NotFoundException('Target plan not found');
        }

        if (
            plan.status === TargetPlanStatus.DRAFT ||
            plan.status === TargetPlanStatus.CANCELLED
        ) {
            throw new BadRequestException(
                'Achievements can only be recalculated for PUBLISHED, LOCKED, or CLOSED plans',
            );
        }

        const activeAssignees = plan.assignees.filter(
            (a) => a.status === TargetPlanAssigneeStatus.ACTIVE,
        );
        if (!activeAssignees.length || !plan.metrics.length) {
            throw new BadRequestException('Plan must have active assignees and metrics');
        }

        const calculatedAt = new Date();
        const snapshots: Partial<TargetAchievementSnapshotEntity>[] = [];

        for (const assignee of activeAssignees) {
            for (const metric of plan.metrics) {
                const achievementValue = await this.computeAchievementValue(
                    tenantDb,
                    metric,
                    assignee.assigneeId,
                    plan.startDate,
                    plan.endDate,
                );
                const targetValue = Number(metric.targetValue);
                const achievementPercentage =
                    targetValue > 0 ? (achievementValue / targetValue) * 100 : 0;
                const remainingValue = Math.max(targetValue - achievementValue, 0);

                snapshots.push({
                    targetAssigneeId: assignee.id,
                    targetMetricId: metric.id,
                    targetValue,
                    achievementValue,
                    achievementPercentage,
                    remainingValue,
                    calculatedFrom: plan.startDate,
                    calculatedTo: plan.endDate,
                    calculatedAt,
                });
            }
        }

        await tenantDb.transaction(async (manager) => {
            const snapshotRepo = manager.getRepository(TargetAchievementSnapshotEntity);
            const assigneeIds = activeAssignees.map((a) => a.id);
            if (assigneeIds.length) {
                await snapshotRepo.delete({ targetAssigneeId: In(assigneeIds) });
            }
            if (snapshots.length) {
                await snapshotRepo.save(snapshots.map((s) => snapshotRepo.create(s)));
            }
        });

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: user.userId,
            action: 'TARGET_PLAN_RECALCULATED',
            description: `Target plan ${plan.name} achievements recalculated`,
            metadata: { targetPlanId: id, snapshotCount: snapshots.length },
        });

        return this.view(tenantDb, id, user);
    }
}
