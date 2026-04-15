import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";



export class CreateRole {
    @IsString()
    code: string;

    @IsString()
    name: string;

    @IsBoolean()
    is_active?: boolean

    @IsArray()
    @IsString({ each: true })
    permissions: string[];
}