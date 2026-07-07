import { memoryStorage } from 'multer';
import {
  SALESMAN_VISIT_IMAGE_ALLOWED_MIME_TYPES,
  SALESMAN_VISIT_IMAGE_MAX_BYTES,
  SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD,
} from './salesman-visit-image.multer';

export const MERCHANDISER_BULK_MERCHANDISING_MAX = 50;

export const merchandiserMerchandisingImageMulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: SALESMAN_VISIT_IMAGE_MAX_BYTES,
    files:
      MERCHANDISER_BULK_MERCHANDISING_MAX *
      SALESMAN_VISIT_IMAGE_MAX_FILES_PER_FIELD,
  },
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
        new Error('shelfImages must be PNG, JPEG, or WebP images'),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
