import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateUomDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsUUID()
  childUomId?: string;
}
