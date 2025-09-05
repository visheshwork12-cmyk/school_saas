// src/api/v1/shared/files/routes/files.routes.js - COMPLETE FIXED VERSION
import { Router } from 'express';
import { CloudinaryUploadService } from '../services/cloudinary-upload.service.js';

/**
 * @swagger
 * components:
 *   schemas:
 *     FileUploadResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: File uploaded successfully
 *         data:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             filename:
 *               type: string
 *             url:
 *               type: string
 *               format: uri
 *             publicId:
 *               type: string
 */

const router = Router();
const uploadService = new CloudinaryUploadService();

// Test middleware
const testAuthMiddleware = (req, res, next) => {
  req.user = {
    userId: 'test-user-123',
    email: 'test@school.com',
    role: 'admin'
  };
  req.context = {
    tenantId: req.headers['x-tenant-id'] || 'test-school'
  };
  next();
};

router.use(testAuthMiddleware);

/**
 * @swagger
 * /api/v1/files/test:
 *   get:
 *     summary: Test file upload service
 *     tags: [Files]
 *     responses:
 *       200:
 *         description: File service is working
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ Cloudinary file upload routes are working!',
    timestamp: new Date().toISOString(),
    cloudinary: {
      configured: !!process.env.CLOUDINARY_CLOUD_NAME
    }
  });
});

/**
 * @swagger
 * /api/v1/files/upload/single:
 *   post:
 *     summary: Upload single file
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               category:
 *                 type: string
 *                 default: test
 *               isPublic:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileUploadResponse'
 */
router.post('/upload/single',  
  uploadService.upload.single('file'),
  async (req, res) => {
    try {
      const { tenantId } = req.context;
      const { userId } = req.user;
      const { category = 'test', isPublic = false } = req.body;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      const result = await uploadService.uploadSingle(req.file, {
        tenantId,
        userId,
        category,
        isPublic: isPublic === 'true',
      });
      
      res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        data: result.file,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/files/{publicId}:
 *   delete:
 *     summary: Delete file
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted successfully
 */
router.delete('/:publicId', async (req, res) => {
  try {
    const { tenantId } = req.context;
    const { userId } = req.user;
    const { publicId } = req.params;
    
    const result = await uploadService.deleteFile(publicId, {
      tenantId,
      userId,
    });
    
    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
