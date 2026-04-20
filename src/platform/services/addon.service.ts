import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Addon } from "src/master-db/entities/addon.entity";
import { Not, Repository } from "typeorm";
import { CreateAddonDto } from "../dto/addon/create-addon.dto";
import { UpdateAddonDto } from "../dto/addon/update-addon.dto";

@Injectable()
export class AddonService {
    constructor(
        @InjectRepository(Addon)
        private readonly addonRepository: Repository<Addon>,
    ) {}

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
        return addon;
    }

    async createAddon(data: CreateAddonDto) {
        const addon = this.addonRepository.create(data);
        return this.addonRepository.save(addon);
    }

    async updateAddon(id: number, data: UpdateAddonDto) {
        const addon = await this.getAddonById(id);
        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        Object.assign(addon, data);
        return this.addonRepository.save(addon);
    }

    async updateAddonStatus(id: number, isActive: boolean) {
        const addon = await this.getAddonById(id);
        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        addon.is_active = isActive;
        return this.addonRepository.save(addon);
    }
}