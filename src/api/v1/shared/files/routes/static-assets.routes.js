// src/api/v1/shared/files/routes/static-assets.routes.js
import { Router } from 'express';
import multer from 'multer';
import staticAssetsController from '../controllers/static-assets.controller.js';
import { authMiddleware } from '#shared/middleware/auth/jwt.middleware.js';
import { validateStaticAssetUpload } from '../validators/static-asset.validator.js';
import { rateLimitMiddleware } from '#shared/middleware/rate-limiting/global-rate-limit.middleware.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10 // Maximum 10 files at once
  },
  fileFilter: (req, file, cb) => {
    // Allow common static asset file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'text/css', 'application/javascript', 'application/json',
      'application/pdf', 'font/woff', 'font/woff2', 'application/font-woff',
      'application/x-font-ttf', 'image/x-icon'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed for static assets`));
    }
  }
});

// Apply rate limiting and authentication
router.use(rateLimitMiddleware);
router.use(authMiddleware);

// Routes
router.post(
  '/upload',
  upload.single('file'),
  validateStaticAssetUpload,
  staticAssetsController.uploadAsset
);

router.post(
  '/upload/batch',
  upload.array('files', 10),
  staticAssetsController.uploadMultipleAssets
);

router.delete(
  '/:key',
  staticAssetsController.deleteAsset
);

router.get(
  '/:key/info',
  staticAssetsController.getAssetInfo
);

router.post(
  '/:sourceKey/copy',
  staticAssetsController.copyAsset
);

router.get(
  '/:key/signed-url',
  staticAssetsController.generateSignedUrl
);

router.post(
  '/invalidate-cache',
  staticAssetsController.invalidateCache
);

export default router;
