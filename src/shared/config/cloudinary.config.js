// src/shared/config/cloudinary.config.js
import { v2 as cloudinary } from 'cloudinary';
import { logger } from '#utils/core/logger.js';

/**
 * Cloudinary Configuration for Hybrid Deployment
 * Supports both Vercel and AWS environments
 */
const cloudinaryConfig = {
  development: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'school-erp-dev',
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
    folder: process.env.CLOUDINARY_FOLDER || 'school-erp/development',
    upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || 'school-erp-dev',
  },
  
  production: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
    folder: process.env.CLOUDINARY_FOLDER || 'school-erp/production',
    upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || 'school-erp-prod',
  },
  
  staging: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
    folder: process.env.CLOUDINARY_FOLDER || 'school-erp/staging',
    upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || 'school-erp-staging',
  }
};

const currentEnv = process.env.NODE_ENV || 'development';
const config = cloudinaryConfig[currentEnv];

// Initialize Cloudinary
cloudinary.config({
  cloud_name: config.cloud_name,
  api_key: config.api_key,
  api_secret: config.api_secret,
  secure: config.secure
});

// Verify connection
const verifyCloudinaryConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    logger.info('✅ Cloudinary connection verified', { status: result.status });
    return true;
  } catch (error) {
    logger.error('❌ Cloudinary connection failed', { error: error.message });
    return false;
  }
};

export { cloudinary, config as cloudinaryConfig, verifyCloudinaryConnection };
