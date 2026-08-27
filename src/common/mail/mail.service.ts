import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

export type MailAttachment = {
    filename: string;
    content: Buffer | string;
    contentType?: string;
};

@Injectable()
export class MailService {
    constructor(private readonly httpService: HttpService) {}

    async sendEmail(
        toEmail: string | string[],
        subject: string,
        bodyHtml: string,
        fromEmail: string,
        attachments?: MailAttachment[],
    ) {
        const url = process.env.MAIL_SERVICE_URL;
        const masterUser = process.env.MAIL_SERVICE_MASTER_USER;

        const formData = new FormData();

        if (masterUser) {
            formData.append('master_user', masterUser);
        }

        formData.append('from_email', fromEmail);

        // API expects repeated `to_email` keys (one email per field), not a comma-separated string
        const recipients = Array.isArray(toEmail) ? toEmail : [toEmail];
        for (const email of recipients) {
            formData.append('to_email', email);
        }

        formData.append('subject', subject);
        formData.append('body_html', bodyHtml);

        if (attachments?.length) {
            for (const file of attachments) {
                formData.append('attachments', file.content, {
                    filename: file.filename,
                    contentType: file.contentType,
                });
            }
        }

        const response = await firstValueFrom(
            this.httpService.post(url!, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'x-api-key': process.env.MAIL_API_KEY!,
                },
            }),
        );

        return response.data;
    }

    private renderTemplate(templateName: string, data: Record<string, any>) {
        const filePath = path.join(process.cwd(), 'src/common/mail/templates', `${templateName}.hbs`);
        const source = fs.readFileSync(filePath, 'utf8');
        const template = Handlebars.compile(source);
        return template(data);
    }

    renderVerifyEmailTemplate(data: { logoUrl: string; name: string; otp: string; year: number }) {
        return this.renderTemplate('verify-email', data);
    }

    renderResetPasswordTemplate(data: { logoUrl: string; name: string; otp: string; year: number }) {
        return this.renderTemplate('reset-password-email', data);
    }

    renderTenantOtpTemplate(data: {
        logoUrl: string;
        tenantName: string;
        recipientName: string;
        otp: string;
        heading: string;
        message: string;
        expiryMinutes: number;
        year: number;
    }) {
        return this.renderTemplate('tenant-otp-email', data);
    }

    renderTenantUserInviteTemplate(data: {
        logoUrl: string;
        invitedByName: string;
        tenantName: string;
        setupUrl: string;
        year: number;
    }) {
        return this.renderTemplate('tenant-user-invite', data);
    }
}
