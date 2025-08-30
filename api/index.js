// api/index.js - CORRECTED VERSION
let app;
let isInitializing = false;

/**
 * @description Vercel serverless function handler with proper error handling
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export default async function handler(req, res) {
  try {
    // Set CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID, X-School-ID, X-Requested-With');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    // Initialize app if needed (with singleton pattern)
    if (!app && !isInitializing) {
      isInitializing = true;
      try {
        console.log('🔄 Initializing serverless app...');
        
        // Set environment for serverless
        process.env.NODE_ENV = process.env.NODE_ENV || 'production';
        process.env.DEPLOYMENT_TYPE = 'serverless';

        // Import the correct function (FIX: was createHybridApp, now createServerlessApp)
        const serverModule = await Promise.race([
          import('../src/server.js'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Import timeout')), 30000)
          )
        ]);

        // Use the correct function name
        app = await serverModule.createServerlessApp();
        console.log('✅ Serverless app initialized successfully');
      } catch (initError) {
        console.error('❌ Failed to initialize serverless app:', initError);
        isInitializing = false;
        return res.status(500).json({
          success: false,
          error: { 
            code: 'SERVERLESS_INIT_ERROR', 
            message: 'Failed to initialize serverless application'
          },
          timestamp: new Date().toISOString()
        });
      } finally {
        isInitializing = false;
      }
    }

    // Wait for initialization to complete
    if (isInitializing) {
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!isInitializing) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 30000);
      });
    }

    // Check if app is available
    if (!app) {
      return res.status(503).json({
        success: false,
        error: { 
          code: 'SERVICE_UNAVAILABLE', 
          message: 'Service is temporarily unavailable' 
        },
        timestamp: new Date().toISOString()
      });
    }

    // Add serverless context to request
    req.serverless = {
      platform: 'vercel',
      region: process.env.VERCEL_REGION || 'iad1',
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
      functionName: 'api/index.js'
    };

    // Execute the app
    return app(req, res);

  } catch (error) {
    console.error('💥 Serverless function error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: { 
          code: 'SERVERLESS_ERROR', 
          message: 'Internal server error' 
        },
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Vercel function configuration
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
  regions: ['iad1'],
  memory: 1024,
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '50mb',
    externalResolver: true
  }
};

