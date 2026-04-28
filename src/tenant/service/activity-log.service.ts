import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateActivityLogDto } from '../dto/activity-log/create-activity-log.dto';
import { ActivityLog } from 'src/tenant-db/entities/activity-log.entity';

@Injectable()
export class ActivityLogService {
    async recordActivityLog(tenantDb: DataSource, payload: CreateActivityLogDto) {
        const activityLogRepo = tenantDb.getRepository(ActivityLog);
        const log = activityLogRepo.create({
            actorId: payload.actorId ?? null,
            action: payload.action,
            description: payload.description ?? null,
            metadata: payload.metadata ?? null,
            jobId: payload.jobId ?? null,
        });

        return activityLogRepo.save(log);
    }

    // Easy helper for system-generated logs.
    async recordSystemActivity(
        tenantDb: DataSource,
        action: string,
        options?: Omit<CreateActivityLogDto, 'action' | 'actorId'>,
    ) {
        return this.recordActivityLog(tenantDb, {
            actorId: null,
            action,
            description: options?.description,
            metadata: options?.metadata,
            jobId: options?.jobId,
        });
    }

    async listActivityLogs(tenantDb: DataSource, page = 1, limit = 10) {
        const activityLogRepo = tenantDb.getRepository(ActivityLog);
        const skip = (page - 1) * limit;
        const [logs, total] = await activityLogRepo.findAndCount({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
            relations: ['actor'],
            select: {
                id: true,
                actorId: true,
                action: true,
                description: true,
                metadata: true,
                jobId: true,
                createdAt: true,
                updatedAt: true,
                actor: {
                    id: true,
                    name: true,
                    email: true,
                }
            },
        });

        return {
            data: logs,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async viewActivityLog(tenantDb: DataSource, id: string) {
        const activityLogRepo = tenantDb.getRepository(ActivityLog);
        const log = await activityLogRepo.findOne({
            where: { id },
            relations: ['actor'],
            select: {
                id: true,
                actorId: true,
                action: true,
                description: true,
                metadata: true,
                jobId: true,
                createdAt: true,
                updatedAt: true,
                actor: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        });

        if (!log) {
            throw new NotFoundException('Activity log not found');
        }

        return log;
    }
}
