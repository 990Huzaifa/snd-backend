import { memoryStorage } from 'multer';

export const SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const SALESMAN_VISIT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD = 10;
export const SALESMAN_BULK_VISIT_MAX = 50;

export const salesmanVisitImageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: SALESMAN_VISIT_IMAGE_MAX_BYTES },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (
      !SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      callback(
        new Error(
          'shopImages and shelfImages must be PNG, JPEG, or WebP images',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};

export const salesmanBulkVisitImageMulterOptions = {
  ...salesmanVisitImageMulterOptions,
  limits: {
    fileSize: SALESMAN_VISIT_IMAGE_MAX_BYTES,
    files:
      SALESMAN_BULK_VISIT_MAX *
      SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD *
      2,
  },
};
