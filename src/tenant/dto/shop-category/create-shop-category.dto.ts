import { IsString } from 'class-validator';

export class CreateShopCategoryDto {
  @IsString()
  name: string;
}
