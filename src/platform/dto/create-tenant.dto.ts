import { IsString, Matches, Length, IsEmail } from 'class-validator';

export class CreateTenantDto {
    // 🌐 subdomain
    @IsString()
    @Matches(/^[a-z][a-z0-9-]+$/, {
        message: 'Tenant name must be a valid subdomain',
    })
    @Length(2, 30)
    name: string;
    
    @IsEmail()
    email: string;
}
