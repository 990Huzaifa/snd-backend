import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ModuleService } from "../services/module.service";
import { CreateModuleDto } from "../dto/module/create-module.dto";
import { UpdateModuleDto } from "../dto/module/update-module.dto";

@Controller("platform/module")
export class ModuleController {
    constructor(
        private readonly moduleService: ModuleService,
    ) {}

    @Get("/")
    async getModules(@Query("page") page: number = 1, @Query("limit") limit: number = 10, @Req() req: any) {
        return this.moduleService.getModules(page, limit, req.user);
    }

    @Get("/:id")
    async getModuleById(@Param("id") id: string, @Req() req: any) {
        return this.moduleService.getModuleById(id, req.user);
    }

    @Post("/")
    async createModule(@Body() data: CreateModuleDto, @Req() req: any) {
        return this.moduleService.createModule(data, req.user);
    }

    @Put("/:id")
    async updateModule(@Param("id") id: string, @Body() data: UpdateModuleDto, @Req() req: any) {
        return this.moduleService.updateModule(id, data, req.user);
    }

    @Put("/:id/status")
    async updateModuleStatus(@Param("id") id: string, @Query("is_active") isActive: boolean, @Req() req: any) {
        return this.moduleService.updateModuleStatus(id, isActive, req.user);
    }
}
