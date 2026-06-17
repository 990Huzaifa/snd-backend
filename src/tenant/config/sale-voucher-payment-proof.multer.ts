import { memoryStorage } from 'multer';

export const PAYMENT_PROOF_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
] as const;

export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;

export const saleVoucherPaymentProofMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: PAYMENT_PROOF_MAX_BYTES },
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
