import { IsOptional, IsString } from 'class-validator';

export class UpdateShopCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;
}
