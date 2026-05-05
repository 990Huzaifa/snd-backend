import { IsBoolean } from 'class-validator';

export class UpdateSchemeStatusDto {
  @IsBoolean()
  status: boolean;
}
