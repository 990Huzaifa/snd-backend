import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

export const TenantConnection = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DataSource => {
    const req = ctx.switchToHttp().getRequest<{ tenantDb?: DataSource }>();
    if (!req.tenantDb) {
      throw new InternalServerErrorException(
        'Tenant connection is not available on request',
      );
    }

    return req.tenantDb;
  },
);
