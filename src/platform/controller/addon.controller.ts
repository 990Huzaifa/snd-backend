import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { AddonService } from "../services/addon.service";
import { CreateAddonDto } from "../dto/addon/create-addon.dto";
import { UpdateAddonDto } from "../dto/addon/update-addon.dto";

@Controller('platform/addon')
export class AddonController {
    constructor(
        private readonly addonService: AddonService,
    ) {}

    @Get('/')
    async getAddons(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
        return this.addonService.getAddons(page, limit);
    }
    @Get('/:id')
    async getAddonById(@Param('id') id: number) {
        return this.addonService.getAddonById(id);
    }

    @Post("/")
    async createAddon(@Body() data: CreateAddonDto) {
        // Implementation for creating an addon
        return this.addonService.createAddon(data);
    }

    @Put('/:id')
    async updateAddon(@Param('id') id: number, @Body() data: UpdateAddonDto) {
        // Implementation for updating an addon
        return this.addonService.updateAddon(id, data);
    }

    @Put('/:id/status')
    async updateAddonStatus(@Param('id') id: number, @Query('is_active') isActive: boolean) {
        // Implementation for updating addon status
        return this.addonService.updateAddonStatus(id, isActive);
    }
}