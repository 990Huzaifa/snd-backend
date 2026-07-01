import { Transform, Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { RetailerClass, Status } from 'src/tenant-db/entities/retailer.entity';

export class CreateRetailerShopDto {
    @IsString()
    shopName: string;

    @IsString()
    ownerName: string;

    @IsOptional()
    @IsString()
    image?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    CNIC?: string;

    @IsString()
    address: string;

    @IsString()
    latitude: string;

    @IsString()
    longitude: string;

    @IsEnum(RetailerClass)
    class: RetailerClass;

    @IsOptional()
    @IsEnum(Status)
    status?: Status;

    @IsUUID()
    routeId: string;

    @IsUUID()
    retailerCategoryId: string;

    @IsUUID()
    retailerChannelId: string;
}

function parseShopsField(value: unknown): unknown {
    if (typeof value === 'string') {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (
            parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { shops?: unknown }).shops)
        ) {
            return (parsed as { shops: unknown[] }).shops;
        }
        return parsed;
    }
    if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Array.isArray((value as { shops?: unknown }).shops)
    ) {
        return (value as { shops: unknown[] }).shops;
    }
    return value;
}

export class BulkCreateRetailerDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Transform(({ value }) => parseShopsField(value))
    @Type(() => CreateRetailerShopDto)
    shops: CreateRetailerShopDto[];
}
