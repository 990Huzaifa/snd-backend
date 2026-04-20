import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Module } from "src/master-db/entities/module.entity";
import { Repository } from "typeorm";
import { CreateModuleDto } from "../dto/module/create-module.dto";
import { UpdateModuleDto } from "../dto/module/update-module.dto";

@Injectable()
export class ModuleService {
    constructor(
        @InjectRepository(Module)
        private readonly moduleRepository: Repository<Module>,
    ) {}

    async getModules(page: number, limit: number) {
        const skip = (page - 1) * limit;
        const [modules, total] = await this.moduleRepository.findAndCount({
            skip,
            take: limit,
        });
        return {
            data: modules,
            meta: {
                total,
                page,
                limit,
            },
        };
    }

    async getModuleById(id: string) {
        const module = await this.moduleRepository.findOne({ where: { id } });
        if (!module) {
            throw new NotFoundException("Module not found");
        }
        return module;
    }

    async createModule(data: CreateModuleDto) {
        const module = this.moduleRepository.create(data);
        return this.moduleRepository.save(module);
    }

    async updateModule(id: string, data: UpdateModuleDto) {
        const module = await this.getModuleById(id);
        if (!module) {
            throw new NotFoundException("Module not found");
        }
        Object.assign(module, data);
        return this.moduleRepository.save(module);
    }

    async updateModuleStatus(id: string, isActive: boolean) {
        const module = await this.getModuleById(id);
        if (!module) {
            throw new NotFoundException("Module not found");
        }
        module.isActive = isActive;
        return this.moduleRepository.save(module);
    }
}
