import { IsString, MinLength } from 'class-validator';

export class ChangeProfilePasswordDto {
  @IsString()
  @MinLength(8)
  password: string;
}
