import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ModuleService } from "../services/module.service";
import { CreateModuleDto } from "../dto/module/create-module.dto";
import { UpdateModuleDto } from "../dto/module/update-module.dto";

@Controller("platform/module")
export class ModuleController {
    constructor(
        private readonly moduleService: ModuleService,
    ) {}

    @Get("/")
    async getModules(@Query("page") page: number = 1, @Query("limit") limit: number = 10) {
        return this.moduleService.getModules(page, limit);
    }

    @Get("/:id")
    async getModuleById(@Param("id") id: string) {
        return this.moduleService.getModuleById(id);
    }

    @Post("/")
    async createModule(@Body() data: CreateModuleDto) {
        return this.moduleService.createModule(data);
    }

    @Put("/:id")
    async updateModule(@Param("id") id: string, @Body() data: UpdateModuleDto) {
        return this.moduleService.updateModule(id, data);
    }

    @Put("/:id/status")
    async updateModuleStatus(@Param("id") id: string, @Query("is_active") isActive: boolean) {
        return this.moduleService.updateModuleStatus(id, isActive);
    }
}
