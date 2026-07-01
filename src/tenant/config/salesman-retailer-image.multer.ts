import { memoryStorage } from 'multer';
import { ASSET_RULES, AssetPurpose } from './asset-rules.config';

const retailerImageRules = ASSET_RULES[AssetPurpose.RETAILER_IMAGE];

export const SALESMAN_RETAILER_SYNC_MAX_SHOPS = 50;

export const salesmanRetailerImageMulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: retailerImageRules.maxSizeBytes,
    files: SALESMAN_RETAILER_SYNC_MAX_SHOPS,
  },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (
      !retailerImageRules.allowedMimeTypes.includes(
        file.mimetype as (typeof retailerImageRules.allowedMimeTypes)[number],
      )
    ) {
      callback(
        new Error('Retailer images must be PNG, JPEG, or WebP'),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
