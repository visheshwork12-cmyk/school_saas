// scripts/test-cloudinary-connection.js
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

// Load .env from root
dotenv.config({ path: join(rootDir, '.env') });
// Load .env.development
dotenv.config({ path: join(rootDir, 'config', '.env.development') });

import { v2 as cloudinary } from 'cloudinary';

// Simple logger for testing
const log = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} [${level}]: ${message}`, Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '');
};

async function testCloudinaryConnection() {
  log('info', '🧪 Testing Cloudinary connection...');
  
  // Check environment variables
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  
  log('info', '📊 Environment Variables Check:', {
    'CLOUDINARY_CLOUD_NAME': cloudName ? '✅ Set' : '❌ Missing',
    'CLOUDINARY_API_KEY': apiKey ? '✅ Set' : '❌ Missing',
    'CLOUDINARY_API_SECRET': apiSecret ? '✅ Set (hidden)' : '❌ Missing',
    'NODE_ENV': process.env.NODE_ENV || 'undefined'
  });
  
  if (!cloudName || !apiKey || !apiSecret) {
    log('error', '❌ Missing Cloudinary credentials in environment variables');
    log('info', '💡 Please check your .env file and make sure all Cloudinary variables are set');
    process.exit(1);
  }
  
  try {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    
    log('info', '🔧 Cloudinary configured successfully');
    
    // Test connection with ping
    const result = await cloudinary.api.ping();
    log('info', '✅ Cloudinary connection successful!', { 
      status: result.status,
      cloudName: cloudName 
    });
    
    // Test upload (optional - small test image)
    try {
      log('info', '📤 Testing upload capability...');
      const testUpload = await cloudinary.uploader.upload(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        {
          public_id: 'test_connection_' + Date.now(),
          folder: 'test',
          resource_type: 'image'
        }
      );
      
      log('info', '✅ Upload test successful!', {
        publicId: testUpload.public_id,
        url: testUpload.secure_url
      });
      
      // Clean up test image
      await cloudinary.uploader.destroy(testUpload.public_id);
      log('info', '🧹 Test image cleaned up');
      
    } catch (uploadError) {
      log('warn', '⚠️ Upload test failed (connection OK, but upload has issues)', {
        error: uploadError.message
      });
    }
    
    process.exit(0);
    
  } catch (error) {
    log('error', '❌ Cloudinary connection failed', {
      error: error.message,
      code: error.http_code || 'N/A'
    });
    
    // Provide specific error help
    if (error.message.includes('Invalid API Key')) {
      log('info', '💡 Fix: Check your CLOUDINARY_API_KEY in .env file');
    } else if (error.message.includes('Invalid cloud name')) {
      log('info', '💡 Fix: Check your CLOUDINARY_CLOUD_NAME in .env file');
    } else if (error.message.includes('Invalid API Secret')) {
      log('info', '💡 Fix: Check your CLOUDINARY_API_SECRET in .env file');
    }
    
    process.exit(1);
  }
}

testCloudinaryConnection();
