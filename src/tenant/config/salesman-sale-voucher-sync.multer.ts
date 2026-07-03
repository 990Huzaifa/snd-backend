import { memoryStorage } from 'multer';
import {
  PAYMENT_PROOF_ALLOWED_MIME_TYPES,
  PAYMENT_PROOF_MAX_BYTES,
} from './sale-voucher-payment-proof.multer';

export const SALESMAN_SALE_VOUCHER_SYNC_MAX = 50;

export const salesmanSaleVoucherSyncMulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: PAYMENT_PROOF_MAX_BYTES,
    files: SALESMAN_SALE_VOUCHER_SYNC_MAX,
  },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (
      !PAYMENT_PROOF_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof PAYMENT_PROOF_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      callback(
        new Error('paymentProof must be a PNG or JPEG image (png, jpg, jpeg)'),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
