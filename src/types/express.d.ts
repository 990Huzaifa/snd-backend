// src/types/express.d.ts
import { TenantContext } from '../common/tenant/tenant-context';

declare global {
    namespace Express {
        interface Request {
            tenant?: TenantContext;
        }
    }
}

export { };
