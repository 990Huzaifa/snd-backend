import { Injectable } from '@nestjs/common';
import {
    DeleteObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
    private readonly bucketName = process.env.AWS_S3_BUCKET!;
    private readonly region = process.env.AWS_REGION || 'ap-south-1';
    private readonly s3Client: S3Client;

    constructor() {
        this.s3Client = new S3Client({
            region: this.region,
            credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                }
                : undefined,
        });
    }

    async uploadObject(
        key: string,
        body: Buffer | Uint8Array | string,
        contentType?: string,
    ) {
        await this.s3Client.send(
            new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: body,
                ContentType: contentType,
            }),
        );

        return {
            key,
            url: this.getObjectUrl(key),
        };
    }

    async deleteObject(key: string) {
        await this.s3Client.send(
            new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            }),
        );
    }

    getObjectUrl(key: string) {
        return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    }
}
