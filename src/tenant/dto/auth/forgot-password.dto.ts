import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  tenantCode?: string;
}

export class VerifyResetOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit code' })
  otp: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  tenantCode?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  resetToken: string;

  @IsString()
  @MinLength(8)
  password: string;
}
