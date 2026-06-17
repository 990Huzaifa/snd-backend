import { memoryStorage } from 'multer';

export const RIDER_DELIVERY_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
] as const;

export const RIDER_DELIVERY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const riderDeliveryImageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: RIDER_DELIVERY_IMAGE_MAX_BYTES },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (
      !RIDER_DELIVERY_IMAGE_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof RIDER_DELIVERY_IMAGE_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      callback(
        new Error(
          'customerSignature and deliveryProof must be PNG or JPEG images (png, jpg, jpeg)',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
