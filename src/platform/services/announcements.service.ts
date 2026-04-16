import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Announcement, AnnouncementPlan, AnnouncementTenant } from "src/master-db/entities/announcement.entity";
import { Repository } from "typeorm";
import { CreateAnnouncementDto } from "../dto/announcement/create-announcement.dto";
import { Auth } from "src/auth/entities/auth.entity";
import { AuthService } from "src/auth/auth.service";
import { UpdateAnnouncementDto } from "../dto/announcement/update-announcement.dto";

@Injectable()
export class AnnouncementService {

    constructor(
        @InjectRepository(Announcement)
        private readonly announcementRepo: Repository<Announcement>,  
        @InjectRepository(AnnouncementPlan)
        private readonly announcementPlanRepo: Repository<AnnouncementPlan>,
        @InjectRepository(AnnouncementTenant)
        private readonly announcementTenantRepo: Repository<AnnouncementTenant>    
    ) {

    }

    async getAnnouncements(page = 1, limit = 10) {

        const skip = (page - 1) * limit;
        const [announcements, total] = await this.announcementRepo.findAndCount({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
            relations: ['createdBy', 'announcement_plans', 'announcement_tenants'],
            select: {
                id: true,
                title: true,
                message: true,
                priority: true,
                isActive: true,
                displayMode: true,
                type: true,
                targetScope: true,
                isDismissable: true,
                startsAt: true,
                endsAt: true,
                createdAt: true,
                updatedAt: true,

                createdBy: {
                    id: true,
                    fullName: true,
                },
            },
        });

        return {
            data: announcements,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async showAnnouncement(id: string) {
        const announcement = await this.announcementRepo.findOne({
            where: { id: id },
            relations: ['createdBy', 'announcement_plans', 'announcement_tenants'],
            select: {
                id: true,
                title: true,
                message: true,
                priority: true,
                isActive: true,
                displayMode: true,
                type: true,
                targetScope: true,
                isDismissable: true,
                startsAt: true,
                endsAt: true,
                createdAt: true,
                updatedAt: true,

                createdBy: {
                    id: true,
                    fullName: true,
                },
            },
        });

        if (!announcement) {
            throw new NotFoundException('Announcement not found');
        }
        return announcement;
    }

    async createAnnouncement(createAnnouncementDto: CreateAnnouncementDto, user: any) {

        const {
            announcement_plans,
            announcement_tenants,
            ...rest
        } = createAnnouncementDto;

        // Create base announcement
        const announcement = this.announcementRepo.create({
            ...rest,
        });

        // ===== HANDLE TARGET LOGIC =====

        if (createAnnouncementDto.targetScope === 'GLOBAL') {
            announcement.announcement_plans = [];
            announcement.announcement_tenants = [];
        }

        if (createAnnouncementDto.targetScope === 'PLAN') {
            if (!Array.isArray(announcement_plans) || announcement_plans.length === 0) {
                throw new BadRequestException('Plan IDs are required for PLAN scope');
            }

            announcement.announcement_plans = announcement_plans.map((p) =>
                this.announcementPlanRepo.create({
                    plan_id: p.plan_id,
                })
            );

            announcement.announcement_tenants = [];
        }

        if (createAnnouncementDto.targetScope === 'TENANT') {
            if (!Array.isArray(announcement_tenants) || announcement_tenants.length === 0) {
                throw new BadRequestException('Tenant IDs are required for TENANT scope');
            }

            announcement.announcement_tenants = announcement_tenants.map((t) =>
                this.announcementTenantRepo.create({
                    tenant_id: t.tenant_id,
                })
            );

            announcement.announcement_plans = [];
        }
        // update create by user id when auth is implemented
        announcement.createdBy = user;


        // ===== SAVE (cascade will handle children) =====
        const saved = await this.announcementRepo.save(announcement);

        return await this.announcementRepo.findOne({
            where: { id: saved.id },
            relations: ['createdBy', 'announcement_plans', 'announcement_tenants'],
            select: {
                id: true,
                title: true,
                message: true,
                priority: true,
                isActive: true,
                displayMode: true,
                type: true,
                targetScope: true,
                isDismissable: true,
                startsAt: true,
                endsAt: true,
                createdAt: true,
                updatedAt: true,

                createdBy: {
                    id: true,
                    fullName: true,
                },
            },
        });
    }

    async updateAnnouncement(id: string, updateAnnouncementDto: UpdateAnnouncementDto, user: any) {
        const announcement = await this.announcementRepo.findOne({ where: { id: id } });
        if (!announcement) {
            throw new NotFoundException('Announcement not found');
        }

        const {
            announcement_plans,
            announcement_tenants,
            ...rest
        } = updateAnnouncementDto;

        // ===== UPDATE BASIC FIELDS =====
        Object.assign(announcement, rest);

        // ===== HANDLE TARGET LOGIC =====

        // Clear old relations first
        await this.announcementPlanRepo.delete({ announcement: { id } });
        await this.announcementTenantRepo.delete({ announcement: { id } });

        if (updateAnnouncementDto.targetScope === 'GLOBAL') {
            announcement.announcement_plans = [];
            announcement.announcement_tenants = [];
        }

        if (updateAnnouncementDto.targetScope === 'PLAN') {
            if (!Array.isArray(announcement_plans) || announcement_plans.length === 0) {
                throw new BadRequestException('Plan IDs are required for PLAN scope');
            }

            announcement.announcement_plans = announcement_plans.map((p) =>
                this.announcementPlanRepo.create({
                    plan_id: p.plan_id,
                    announcement: announcement,
                })
            );

            announcement.announcement_tenants = [];
        }

        if (updateAnnouncementDto.targetScope === 'TENANT') {
            if (!Array.isArray(announcement_tenants) || announcement_tenants.length === 0) {
                throw new BadRequestException('Tenant IDs are required for TENANT scope');
            }

            announcement.announcement_tenants = announcement_tenants.map((t) =>
                this.announcementTenantRepo.create({
                    tenant_id: t.tenant_id,
                    announcement: announcement,
                })
            );

            announcement.announcement_plans = [];
        }

        announcement.createdBy = user;

        const saved = await this.announcementRepo.save(announcement);

        return await this.announcementRepo.findOne({
            where: { id: saved.id },
            relations: ['createdBy', 'announcement_plans', 'announcement_tenants'],
            select: {
                id: true,
                title: true,
                message: true,
                priority: true,
                isActive: true,
                displayMode: true,
                type: true,
                targetScope: true,
                isDismissable: true,
                startsAt: true,
                endsAt: true,
                createdAt: true,
                updatedAt: true,

                createdBy: {
                    id: true,
                    fullName: true,
                },
            },
        });

    }

    async updateAnnouncementStatus(id: string, is_active: boolean) {
        await this.announcementRepo.update(id, { isActive: is_active });
        const announcement = await this.announcementRepo.findOne({ where: { id: id } });
        return announcement;
    }
}