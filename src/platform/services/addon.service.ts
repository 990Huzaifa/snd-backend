import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Addon } from "src/master-db/entities/addon.entity";
import { Not, Repository } from "typeorm";
import { CreateAddonDto } from "../dto/addon/create-addon.dto";
import { UpdateAddonDto } from "../dto/addon/update-addon.dto";
import { ActivityLogService } from "./activity-log.service";
import { ActivityLogActorType } from "src/master-db/entities/activity-log.entity";

@Injectable()
export class AddonService {
    constructor(
        @InjectRepository(Addon)
        private readonly addonRepository: Repository<Addon>,
        private readonly activityLogService: ActivityLogService,
    ) {}

    private async recordAction(action: string, description: string, metadata?: Record<string, any>) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.SYSTEM,
            actorId: null,
            action,
            description,
            metadata: metadata ?? null,
        });
    }

    async getAddons(page: number, limit: number) {
        const skip = (page - 1) * limit;
        const [addons, total] = await this.addonRepository.findAndCount({
            skip,
            take: limit,
        });
        return {
            data: addons,
            meta: {
                total,
                page,
                limit,
            },
        };
    }

    async getAddonById(id: number) {
        const addon = await this.addonRepository.findOne({ where: { id } });
        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        await this.recordAction('ADDON_SHOW', 'Addon details fetched', { addonId: id });
        return addon;
    }

    async createAddon(data: CreateAddonDto) {
        const addon = this.addonRepository.create(data);
        const savedAddon = await this.addonRepository.save(addon);
        await this.recordAction('ADDON_CREATE', 'Addon created', { addonId: savedAddon.id });
        return savedAddon;
    }

    async updateAddon(id: number, data: UpdateAddonDto) {
        const addon = await this.getAddonById(id);
        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        Object.assign(addon, data);
        const savedAddon = await this.addonRepository.save(addon);
        await this.recordAction('ADDON_UPDATE', 'Addon updated', { addonId: id });
        return savedAddon;
    }

    async updateAddonStatus(id: number, isActive: boolean) {
        const addon = await this.getAddonById(id);
        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        addon.is_active = isActive;
        const savedAddon = await this.addonRepository.save(addon);
        await this.recordAction('ADDON_STATUS_UPDATE', 'Addon status updated', { addonId: id, isActive });
        return savedAddon;
    }
}