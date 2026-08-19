import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateUomDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsUUID()
  childUomId?: string;
}
