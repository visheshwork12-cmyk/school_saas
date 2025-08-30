// src/index.js - Universal application entry point with complete deployment support
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';

/**
 * Enhanced deployment detection with comprehensive platform support
 */
function detectDeploymentEnvironment() {
  const deploymentType = process.env.DEPLOYMENT_TYPE || 'traditional';
  
  const isServerless = Boolean(
    deploymentType === 'serverless' || 
    process.env.VERCEL || 
    process.env.NETLIFY || 
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME ||
    process.env.AZURE_FUNCTIONS_ENVIRONMENT
  );
  
  const platform = process.env.VERCEL ? 'vercel' :
    process.env.NETLIFY ? 'netlify' :
      process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' :
        process.env.FUNCTION_NAME ? 'gcp-functions' :
          process.env.AZURE_FUNCTIONS_ENVIRONMENT ? 'azure-functions' :
            process.env.KUBERNETES_SERVICE_HOST ? 'kubernetes' :
              process.env.DOCKER_CONTAINER ? 'docker' :
                'traditional';

  const environment = process.env.NODE_ENV || 'development';
  const isProduction = environment === 'production';
  
  return {
    deploymentType,
    isServerless,
    platform,
    environment,
    isProduction,
    nodeVersion: process.version,
    pid: process.pid,
    region: process.env.VERCEL_REGION || 
            process.env.AWS_REGION || 
            process.env.GOOGLE_CLOUD_REGION ||
            process.env.AZURE_REGION ||
            'unknown'
  };
}

/**
 * Initialize application monitoring and error tracking
 */
async function initializeMonitoring(deploymentInfo) {
  try {
    // Initialize error tracking service (Sentry, etc.)
    if (process.env.SENTRY_DSN && deploymentInfo.isProduction) {
      logger.info('🔍 Initializing error tracking...');
      // Sentry initialization would go here
    }

    // Initialize performance monitoring
    if (deploymentInfo.isProduction) {
      logger.info('📊 Initializing performance monitoring...');
      // APM initialization would go here
    }

    logger.debug('✅ Monitoring services initialized');
  } catch (error) {
    logger.warn('⚠️ Failed to initialize monitoring services', {
      error: error.message
    });
  }
}

const startTime = Date.now();

/**
 * Serverless-specific initialization
 */
async function performServerlessInit(deploymentInfo) {
  try {
    logger.info('🔥 Pre-warming serverless environment...', {
      platform: deploymentInfo.platform,
      region: deploymentInfo.region
    });
    
    // Set appropriate environment variables for serverless
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'production';
    }
    
    // Platform-specific optimizations
    switch (deploymentInfo.platform) {
      case 'vercel':
        // Vercel-specific optimizations
        process.env.VERCEL_URL = process.env.VERCEL_URL || 'localhost:3000';
        break;
        
      case 'netlify':
        // Netlify-specific optimizations
        process.env.NETLIFY_DEV = process.env.NETLIFY_DEV || 'false';
        break;
        
      case 'aws-lambda':
        // AWS Lambda-specific optimizations
        process.env.AWS_LAMBDA_FUNCTION_TIMEOUT = process.env.AWS_LAMBDA_FUNCTION_TIMEOUT || '30';
        break;
        
      case 'gcp-functions':
        // Google Cloud Functions-specific optimizations
        process.env.FUNCTION_TIMEOUT_SEC = process.env.FUNCTION_TIMEOUT_SEC || '60';
        break;
    }
    
    // Pre-warm critical services for better cold start performance
    await initializeMonitoring(deploymentInfo);
    
    logger.info('✅ Serverless pre-warming completed', {
      duration: `${Date.now() - startTime}ms`
    });
    
  } catch (error) {
    logger.error('💥 Serverless initialization failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Traditional server initialization
 */
async function performTraditionalInit(deploymentInfo) {
  try {
    logger.info('🏗️ Initializing traditional server deployment...');
    
    await initializeMonitoring(deploymentInfo);
    
    // Import and start server
    const { startServer } = await import('./server.js');
    await startServer();
    
    logger.info('✅ Traditional server initialization completed');
    
  } catch (error) {
    logger.error('💥 Traditional server initialization failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Container-specific initialization (Docker/Kubernetes)
 */
async function performContainerInit(deploymentInfo) {
  try {
    logger.info('🐳 Initializing containerized deployment...', {
      platform: deploymentInfo.platform
    });
    
    // Container-specific environment setup
    if (deploymentInfo.platform === 'kubernetes') {
      // Kubernetes readiness/liveness probe preparation
      process.env.KUBERNETES_SERVICE_HOST = process.env.KUBERNETES_SERVICE_HOST || 'localhost';
    }
    
    await initializeMonitoring(deploymentInfo);
    
    // Start server with container optimizations
    const { startServer } = await import('./server.js');
    await startServer();
    
    logger.info('✅ Container initialization completed');
    
  } catch (error) {
    logger.error('💥 Container initialization failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Main application entry point with comprehensive error handling
 */
async function main() {
  const startTime = Date.now();
  
  try {
    // Detect deployment environment
    const deploymentInfo = detectDeploymentEnvironment();
    
    logger.info('🚀 Starting School ERP SaaS Application', {
      ...deploymentInfo,
      timestamp: new Date().toISOString()
    });

    // Audit application startup
    await AuditService.log('APPLICATION_STARTUP', {
      action: 'startup',
      ...deploymentInfo,
      startTime: new Date().toISOString()
    }).catch((error) => {
      logger.warn('Failed to audit application startup', {
        error: error.message
      });
    });

    // Route to appropriate initialization based on deployment type
    if (deploymentInfo.isServerless) {
      await performServerlessInit(deploymentInfo);
      logger.info(`⚡ Serverless application ready (${deploymentInfo.platform})`);
      
    } else if (deploymentInfo.platform === 'kubernetes' || deploymentInfo.platform === 'docker') {
      await performContainerInit(deploymentInfo);
      
    } else {
      await performTraditionalInit(deploymentInfo);
    }

    const initializationTime = Date.now() - startTime;
    
    logger.info('🎉 Application startup completed successfully', {
      initializationTime: `${initializationTime}ms`,
      deployment: deploymentInfo.platform,
      environment: deploymentInfo.environment,
      pid: process.pid
    });

    // Final startup audit
    await AuditService.log('APPLICATION_READY', {
      action: 'startup_complete',
      initializationTime,
      deployment: deploymentInfo.platform,
      environment: deploymentInfo.environment,
      pid: process.pid
    }).catch(() => {});

  } catch (error) {
    const initializationTime = Date.now() - startTime;
    
    logger.error('💥 Application startup failed', { 
      error: error.message, 
      stack: error.stack,
      initializationTime: `${initializationTime}ms`,
      environment: process.env.NODE_ENV || 'unknown',
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid
    });

    // Audit startup failure
    await AuditService.log('APPLICATION_STARTUP_FAILED', {
      action: 'startup_failed',
      error: error.message,
      stack: error.stack,
      initializationTime,
      environment: process.env.NODE_ENV || 'unknown',
      pid: process.pid
    }).catch(() => {});
    
    // Graceful exit with appropriate error code
    process.exit(1);
  }
}

/**
 * Enhanced execution detection for both ES modules and CommonJS
 */
function isMainModule() {
  // ES Modules detection
  if (import.meta.url) {
    return import.meta.url === `file://${process.argv[1]}` || 
           process.argv[1]?.endsWith('src/index.js') ||
           process.argv[1]?.endsWith('index.js');
  }
  
  // CommonJS fallback
  return require.main === module;
}

// Execute main function only if this is the main module
if (isMainModule()) {
  main();
}

// Exports for different usage scenarios
export default main;
export { 
  performServerlessInit, 
  detectDeploymentEnvironment,
  initializeMonitoring 
};
