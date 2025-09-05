// src/api/v1/shared/files/controllers/upload.controller.js
import { CloudinaryUploadService } from '../services/cloudinary-upload.service.js';
import catchAsync from '#utils/core/catchAsync.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';


/**
 * File Upload Controller using Cloudinary
 */
export class UploadController {
    constructor() {
        this.uploadService = new CloudinaryUploadService();
    }

    /**
     * Upload single file
     */
    uploadSingle = catchAsync(async (req, res) => {
        const { tenantId } = req.context;
        const { userId } = req.user;
        const { category, isPublic = false } = req.body;

        if (!req.file) {
            throw new BusinessException('No file uploaded', 'NO_FILE', 400);
        }

        const result = await this.uploadService.uploadSingle(req.file, {
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
    });

    /**
     * Upload multiple files
     */
    uploadMultiple = catchAsync(async (req, res) => {
        const { tenantId } = req.context;
        const { userId } = req.user;
        const { category, isPublic = false } = req.body;

        if (!req.files || req.files.length === 0) {
            throw new BusinessException('No files uploaded', 'NO_FILES', 400);
        }

        const result = await this.uploadService.uploadMultiple(req.files, {
            tenantId,
            userId,
            category,
            isPublic: isPublic === 'true',
        });

        res.status(200).json({
            success: true,
            message: `${result.successCount} files uploaded successfully`,
            data: result,
        });
    });

    /**
     * Delete file
     */
    deleteFile = catchAsync(async (req, res) => {
        const { tenantId } = req.context;
        const { userId } = req.user;
        const { publicId } = req.params;

        const result = await this.uploadService.deleteFile(publicId, {
            tenantId,
            userId,
        });

        res.status(200).json({
            success: true,
            message: 'File deleted successfully',
            data: result,
        });
    });

    /**
     * Get optimized file URL
     */
    getOptimizedUrl = catchAsync(async (req, res) => {
        const { publicId } = req.params;
        const transformations = req.query;

        const url = this.uploadService.getOptimizedUrl(publicId, transformations);

        res.status(200).json({
            success: true,
            data: { url },
        });
    });
}

export default UploadController;
