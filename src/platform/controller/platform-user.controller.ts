import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PlatformUserService } from "../services/platform-user.service";
import { CreateRoleDto } from "../dto/role/create-role.dto";
import { UpdateRoleDto } from "../dto/role/update-role.dto";
import { CreatePlatformUserDto } from "../dto/create-platform-user.dto";
import { PermissionGuard } from "src/auth/permission.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RequirePermissions } from "src/auth/require-permission.decorator";

@Controller('platform')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PlatformUserController {
    constructor(
        private readonly platformUserService: PlatformUserService
    ) { }


    // PERMISSIONS
    @Get('permissions')
    async getPermissionList(){
        return this.platformUserService.getPlatformPermissionList();
    }

    @Post('permissions/create')
    async createPermission(@Body() perData: any){
        return this.platformUserService.createPlatformPermission(perData);
    }


    // ROlES
    @RequirePermissions('ROLE_LIST')
    @Get('roles')
    async getRoleList(){
        return this.platformUserService.getPlatformRoleList();
    }

    @RequirePermissions('ROLE_VIEW')
    @Get('roles/:id')
    async getRoleById(@Param('id') id: string){
        return this.platformUserService.getPlatformRole(id);
    }

    @RequirePermissions('ROLE_CREATE')
    @Post('roles/create')
    async createRole(@Body() roleData: CreateRoleDto){
        return this.platformUserService.createPlatformRole(roleData);
    }

    // @RequirePermissions('ROLE_UPDATE')
    @Post('roles/update/:id')
    async updateRole(@Param('id') id: string,@Body() roleData: UpdateRoleDto){
        return this.platformUserService.updatePlatformRole(id, {...roleData});
    }


    // USERS

    @RequirePermissions('USER_LIST')
    @Get('users')
    async getUserList(){
        return this.platformUserService.getPlatformUserList();
    }

    @RequirePermissions('USER_VIEW')
    @Get('users/:id')
    async getUserById(@Param('id') id: string){
        return this.platformUserService.getPlatformUser(id);
    }

    @RequirePermissions('USER_CREATE')
    @Post('users/create')
    async createUser(@Body() userData: CreatePlatformUserDto){
        return this.platformUserService.createPlatformUser(userData);
    }
}