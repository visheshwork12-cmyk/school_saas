// src/app.js - Enhanced for hybrid deployment with better error handling - FIXED VERSION
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
// import mongoSanitize from "express-mongo-sanitize";
// import xss from "xss-clean";
// import hpp from "hpp";
import passport from "passport";
import { logger } from "#utils/core/logger.js";
import baseConfig from "#shared/config/environments/base.config.js";
import { requestId } from "#shared/middleware/global/request-id.middleware.js";
import { tenantMiddleware } from "#core/tenant/middleware/tenant.middleware.js";
import { errorHandler } from "#shared/middleware/error-handling/error-handler.middleware.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import HTTP_STATUS from "#constants/http-status.js";
import healthRoutes from '#routes/health.routes.js';
// import redoc from "redoc-express";
// import swaggerJsdoc from "swagger-jsdoc";
// import swaggerUi from "swagger-ui-express";

/**
 * Detect deployment environment with enhanced detection
 */
const getDeploymentInfo = () => {
  const isServerless = Boolean(
    process.env.DEPLOYMENT_TYPE === "serverless" ||
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME,
  );

  const platform = process.env.VERCEL
    ? "vercel"
    : process.env.NETLIFY
      ? "netlify"
      : process.env.AWS_LAMBDA_FUNCTION_NAME
        ? "aws-lambda"
        : process.env.FUNCTION_NAME
          ? "gcp-functions"
          : "traditional";

  return {
    isServerless,
    platform,
    environment: process.env.NODE_ENV || "development",
    region: process.env.VERCEL_REGION || process.env.AWS_REGION || "unknown",
  };
};

/**
 * Configure security middleware - FIXED FOR SWAGGER UI
 */
const configureSecurity = (app, deploymentInfo) => {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            // ✅ ADD: Allow Swagger UI CDN
            "https://unpkg.com",
            "https://cdn.jsdelivr.net"
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
            // ✅ ADD: Allow Swagger UI CSS CDN
            "https://unpkg.com",
            "https://cdn.jsdelivr.net"
          ],
          imgSrc: [
            "'self'",
            "data:",
            "https:",
            baseConfig.aws?.s3Bucket || '*'
          ],
          connectSrc: [
            "'self'",
            baseConfig.redis?.url || '*'
          ],
          fontSrc: [
            "'self'",
            "data:",
            "https://fonts.gstatic.com",
            "https://fonts.googleapis.com"
          ],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: deploymentInfo.isServerless ? false : {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    })
  );

  // Rest of security middleware...
};

/**
 * Configure CORS
 */
const configureCors = (app, deploymentInfo) => {
  const corsOptions = {
    origin: (origin, callback) => {
      if (deploymentInfo.isServerless) {
        callback(null, true);
      } else {
        const { allowedOrigins } = baseConfig.cors;
        if (
          !origin ||
          allowedOrigins.includes("*") ||
          allowedOrigins.includes(origin)
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      }
    },
    methods: baseConfig.cors.methods,
    credentials: !deploymentInfo.isServerless,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-ID",
      "X-School-ID",
      "X-Requested-With",
      "X-Request-ID",
      "Accept",
      "Origin",
    ],
    maxAge: 86400,
  };

  app.use(cors(corsOptions));
};

/**
 * Configure body parsing
 */
const configureBodyParsing = (app, deploymentInfo) => {
  const jsonLimit = deploymentInfo.isServerless
    ? "10mb"
    : baseConfig.bodyParser.jsonLimit;
  const urlencodedLimit = deploymentInfo.isServerless
    ? "10mb"
    : baseConfig.bodyParser.urlencodedLimit;

  app.use(
    express.json({
      limit: jsonLimit,
      verify: (req, res, buf) => {
        if (buf.length > 50 * 1024 * 1024) {
          throw new Error("Request entity too large");
        }
      },
    }),
  );
  app.use(
    express.urlencoded({
      extended: true,
      limit: urlencodedLimit,
    }),
  );
};

/**
 * Configure compression
 */
const configureCompression = (app, deploymentInfo) => {
  app.use(
    compression({
      level: deploymentInfo.isServerless ? 1 : baseConfig.compression.level,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );
};

/**
 * Configure rate limiting
 */
const configureRateLimiting = (app, deploymentInfo) => {
  const createRateLimiter = () =>
    rateLimit({
      windowMs: deploymentInfo.isServerless
        ? 60000
        : baseConfig.rateLimit.windowMs,
      max: deploymentInfo.isServerless ? 200 : baseConfig.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests from this IP, please try again later",
        },
      },
      skip: (req) => {
        const skipPaths = ["/health", "/status", "/api-docs", "/docs"];
        return skipPaths.some((path) => req.path.startsWith(path));
      },
      keyGenerator: (req) => {
        return `${req.ip}:${req.get("User-Agent") || "unknown"}`;
      },
      handler: async (req, res) => {
        await AuditService.log("RATE_LIMIT_EXCEEDED", {
          ip: req.ip,
          path: req.path,
          userAgent: req.get("User-Agent"),
        }).catch(() => { });
        res.status(429).json({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests from this IP, please try again later",
          },
        });
      },
    });

  app.use(createRateLimiter());
};

/**
 * Configure public routes - ENHANCED WITH CLOUDINARY HEALTH
 */
const configurePublicRoutes = (app, deploymentInfo) => {
  // Root route - before tenant middleware
  app.get('/', (req, res) => {
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Welcome to School ERP SaaS API',
      version: baseConfig.versioning?.currentApiVersion || '1.0.0',
      environment: baseConfig.env,
      deployment: deploymentInfo,
      endpoints: {
        health: '/health',
        systemHealth: '/health/system',
        cloudinaryHealth: '/health/cloudinary',
        fileUpload: '/health/files',
        status: '/status',
        apiDocs: '/api-docs',
        api: '/api/v1'
      },
      timestamp: new Date().toISOString()
    });
  });

  // ✅ ENHANCED: Health endpoint with Cloudinary status
  app.get('/health', async (req, res) => {
    try {
      // Check Cloudinary connection
      let cloudinaryStatus = 'not-configured';
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        try {
          const { verifyCloudinaryConnection } = await import("#shared/config/cloudinary.config.js");
          const isConnected = await verifyCloudinaryConnection();
          cloudinaryStatus = isConnected ? 'healthy' : 'unhealthy';
        } catch (error) {
          cloudinaryStatus = 'error';
        }
      }

      const healthCheck = {
        status: 'healthy',
        uptime: process.uptime(),
        environment: baseConfig.env,
        deployment: deploymentInfo,
        version: baseConfig.versioning?.currentApiVersion || '1.0.0',
        timestamp: new Date().toISOString(),
        services: {
          api: 'healthy',
          cloudinary: cloudinaryStatus,
          fileUpload: cloudinaryStatus === 'healthy' ? 'ready' : 'unavailable'
        },
        memory: process.memoryUsage(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      };

      res.status(HTTP_STATUS.OK).json(healthCheck);
    } catch (error) {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Status endpoint (unchanged)
  app.get('/status', (req, res) => {
    res.status(HTTP_STATUS.OK).json({
      status: 'OK',
      uptime: process.uptime(),
      environment: baseConfig.env,
      platform: deploymentInfo.platform,
      serverless: deploymentInfo.isServerless,
      timestamp: new Date().toISOString()
    });
  });
};


/**
 * Configure Swagger documentation - DOCS FOLDER + POSTMAN INTEGRATED
 */
const configureSwagger = async (app, deploymentInfo) => {
  try {
    // Import required modules
    const fs = await import('fs/promises');
    const path = await import('path');
    const yaml = await import('js-yaml');

    let swaggerSpec;

    try {
      // Try to load from OpenAPI YAML first (preferred)
      const openApiPath = path.join(process.cwd(), 'docs/api/openapi.yaml');
      const openApiContent = await fs.readFile(openApiPath, 'utf-8');
      swaggerSpec = yaml.load(openApiContent);
      logger.info('📄 Loaded OpenAPI spec from docs/api/openapi.yaml');
    } catch (yamlError) {
      try {
        // Fallback to swagger-config.js
        const { generateSwaggerSpec } = await import('../docs/api/swagger-config.js');
        swaggerSpec = generateSwaggerSpec();
        logger.info('📄 Generated spec from docs/api/swagger-config.js');
      } catch (configError) {
        // Final fallback to basic spec
        swaggerSpec = {
          openapi: "3.0.0",
          info: {
            title: "School Management API",
            version: "1.0.0",
            description: "School ERP SaaS API Documentation"
          },
          paths: {
            "/health": {
              "get": {
                "summary": "Health Check",
                "responses": { "200": { "description": "System is healthy" } }
              }
            }
          }
        };
        logger.warn('⚠️ Using fallback swagger spec');
      }
    }

    // Serve OpenAPI JSON spec
    app.get("/api-docs.json", (req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(swaggerSpec);
    });

    // Serve Postman Collections
    app.get('/postman/:collection', async (req, res) => {
      try {
        const { collection } = req.params;
        const allowedCollections = ['platform-apis', 'school-apis', 'product-apis'];

        if (!allowedCollections.includes(collection)) {
          return res.status(400).json({ error: 'Invalid collection name' });
        }

        const filePath = path.join(process.cwd(), 'docs/api/postman', `${collection}.json`);
        const content = await fs.readFile(filePath, 'utf-8');

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${collection}.json"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(content);

        logger.info(`📬 Postman collection downloaded: ${collection}.json`);
      } catch (error) {
        logger.error(`Failed to serve Postman collection: ${collection}`, error);
        res.status(404).json({ error: 'Collection not found. Run "npm run docs:postman" to generate collections.' });
      }
    });

    // Check if Postman collections exist
    const checkPostmanCollections = async () => {
      const collections = ['platform-apis.json', 'school-apis.json', 'product-apis.json'];
      const existingCollections = [];

      for (const collection of collections) {
        try {
          const filePath = path.join(process.cwd(), 'docs/api/postman', collection);
          await fs.access(filePath);
          existingCollections.push(collection);
        } catch (error) {
          // Collection doesn't exist
        }
      }

      return existingCollections;
    };

    const existingCollections = await checkPostmanCollections();

    // Enhanced Swagger UI route with Postman integration
    app.get('/api-docs', (req, res) => {
      res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; " +
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https:;"
      );

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>School Management API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin-bottom: 20px; }
    
    .header-section {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      margin-bottom: 0;
    }
    
    .header-section h1 {
      margin: 0 0 10px 0;
      font-size: 2.5em;
      font-weight: 300;
    }
    
    .header-section p {
      margin: 0;
      font-size: 1.1em;
      opacity: 0.9;
    }
    
    .docs-navigation {
      background: #f8f9fa;
      padding: 20px;
      border-bottom: 1px solid #e9ecef;
    }
    
    .docs-link {
      display: inline-block;
      margin: 5px 10px;
      padding: 10px 16px;
      background: #1976d2;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      transition: all 0.3s ease;
    }
    
    .docs-link:hover {
      background: #1565c0;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }
    
    .postman-section {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 8px;
      padding: 20px;
      margin: 20px;
    }
    
    .postman-link {
      display: inline-block;
      margin: 5px 8px;
      padding: 12px 20px;
      background: #ff6c37;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(255, 108, 55, 0.3);
    }
    
    .postman-link:hover {
      background: #e55a2b;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(255, 108, 55, 0.4);
    }
    
    .postman-link:active {
      transform: translateY(0);
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      background: #28a745;
      color: white;
      border-radius: 12px;
      font-size: 0.8em;
      margin-left: 8px;
    }
    
    .warning-badge {
      background: #ffc107;
      color: #212529;
    }
    
    .instructions {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 15px;
      margin: 15px 0;
      border-radius: 0 4px 4px 0;
    }
    
    .instructions h4 {
      margin: 0 0 10px 0;
      color: #1976d2;
    }
    
    .instructions ol {
      margin: 10px 0;
      padding-left: 20px;
    }
    
    .instructions code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Consolas', monospace;
    }
  </style>
</head>
<body>
  <!-- Header Section -->
  <div class="header-section">
    <h1>Hensing API</h1>
    <p>Complete API documentation for multi-tenant School Management System</p>
  </div>

  <!-- Documentation Navigation -->
  <div class="docs-navigation">
    <h3>📚 Complete Documentation</h3>
    <a href="/docs/architecture/system-design" class="docs-link">🏗️ System Architecture</a>
    <a href="/docs/architecture/database-schema" class="docs-link">🗄️ Database Schema</a>
    <a href="/docs/architecture/multi-tenancy" class="docs-link">🏢 Multi-Tenancy</a>
    <a href="/docs/architecture/security-model" class="docs-link">🔐 Security Model</a>
    <a href="/docs/api/examples" class="docs-link">📖 API Examples</a>
  </div>

  <!-- Postman Collections Section -->
  <div class="postman-section">
    <h3>📬 Postman Collections</h3>
    <p>Download ready-to-use Postman collections for testing APIs:</p>
    
    ${existingCollections.length > 0 ? `
    <div style="margin: 15px 0;">
      ${existingCollections.includes('platform-apis.json') ?
            `<a href="${baseUrl}/postman/platform-apis" class="postman-link" target="_blank">
          🏢 Platform APIs <span class="status-badge">Ready</span>
        </a>` :
            `<span class="postman-link" style="background: #6c757d; cursor: not-allowed;">
          🏢 Platform APIs <span class="status-badge warning-badge">Missing</span>
        </span>`
          }
      
      ${existingCollections.includes('school-apis.json') ?
            `<a href="${baseUrl}/postman/school-apis" class="postman-link" target="_blank">
          🏫 School APIs <span class="status-badge">Ready</span>
        </a>` :
            `<span class="postman-link" style="background: #6c757d; cursor: not-allowed;">
          🏫 School APIs <span class="status-badge warning-badge">Missing</span>
        </span>`
          }
      
      ${existingCollections.includes('product-apis.json') ?
            `<a href="${baseUrl}/postman/product-apis" class="postman-link" target="_blank">
          🎓 Product APIs <span class="status-badge">Ready</span>
        </a>` :
            `<span class="postman-link" style="background: #6c757d; cursor: not-allowed;">
          🎓 Product APIs <span class="status-badge warning-badge">Missing</span>
        </span>`
          }
    </div>
    ` : `
    <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 15px; margin: 15px 0;">
      <strong>⚠️ No Postman collections found!</strong>
      <p>Generate collections by running: <code>npm run docs:postman</code></p>
    </div>
    `}
    
    <div class="instructions">
      <h4>🚀 Quick Setup Instructions:</h4>
      <ol>
        <li>Click on any collection link above to download JSON file</li>
        <li>Open Postman → Import → Upload the downloaded JSON file</li>
        <li>Update collection variables:
          <ul>
            <li><code>bearerToken</code> - Your JWT authentication token</li>
            <li><code>tenantId</code> - Your school's tenant identifier</li>
            <li><code>baseUrl</code> - API base URL (already set)</li>
          </ul>
        </li>
        <li>Start testing APIs! 🎯</li>
      </ol>
      
      <p><strong>💡 Tip:</strong> Each collection includes pre-request scripts for authentication and response validation tests.</p>
    </div>
    
    <div style="margin-top: 15px; padding: 10px; background: #d1ecf1; border-radius: 4px;">
      <strong>🔄 Auto-generate Collections:</strong>
      <code>npm run docs:postman</code> - Regenerate from OpenAPI spec
    </div>
  </div>

  <!-- Swagger UI Container -->
  <div id="swagger-ui"></div>

  <!-- Scripts -->
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    // Initialize Swagger UI
    const ui = SwaggerUIBundle({
      url: '${baseUrl}/api-docs.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIStandalonePreset
      ],
      plugins: [
        SwaggerUIBundle.plugins.DownloadUrl
      ],
      layout: "StandaloneLayout",
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      onComplete: function() {
        console.log('📚 Swagger UI loaded successfully');
        
        // Add custom styling
        const style = document.createElement('style');
        style.textContent = \`
          .swagger-ui .btn.authorize {
            background-color: #49cc90;
            border-color: #49cc90;
          }
          .swagger-ui .btn.execute {
            background-color: #4990e2;
            border-color: #4990e2;
          }
        \`;
        document.head.appendChild(style);
      },
      onFailure: function(error) {
        console.error('❌ Swagger UI failed to load:', error);
      }
    });

    // Add download tracking
    document.querySelectorAll('.postman-link').forEach(link => {
      link.addEventListener('click', function(e) {
        const collectionName = this.textContent.trim();
        console.log(\`📥 Downloading Postman collection: \${collectionName}\`);
        
        // Optional: Add analytics tracking here
        if (typeof gtag !== 'undefined') {
          gtag('event', 'download', {
            'event_category': 'postman_collection',
            'event_label': collectionName
          });
        }
      });
    });
  </script>
</body>
</html>`;

      res.send(swaggerHtml);
    });

    // Generate Postman collections if they don't exist
    if (existingCollections.length === 0) {
      logger.info('🔄 No Postman collections found, attempting to generate...');
      try {
        const { generatePostmanCollections } = await import('../scripts/generate-postman.js');
        await generatePostmanCollections();
        logger.info('✅ Postman collections generated successfully');
      } catch (error) {
        logger.warn('⚠️ Could not auto-generate Postman collections:', error.message);
        logger.info('💡 Run "npm run docs:postman" to generate collections manually');
      }
    }

    logger.info(`📚 Swagger UI configured with DOCS + Postman integration (${existingCollections.length}/3 collections available)`);

  } catch (error) {
    logger.error('Failed to configure Swagger with docs + postman integration:', error);

    // Fallback minimal configuration
    app.get("/api-docs.json", (req, res) => {
      res.json({
        openapi: "3.0.0",
        info: { title: "School Management API", version: "1.0.0" },
        paths: {}
      });
    });

    app.get('/api-docs', (req, res) => {
      res.send('<h1>API Documentation</h1><p>Error loading Swagger UI. Please check logs.</p>');
    });

    logger.info('📚 Fallback Swagger configuration loaded');
  }
};


/**
 * Configure file upload specific middleware
 */
const configureFileUpload = (app, deploymentInfo) => {
  // Handle multipart/form-data errors specifically
  app.use('/api/v1/files', (error, req, res, next) => {
    if (error && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds the maximum limit of 10MB',
          maxSize: '10MB'
        },
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    }
    
    if (error && error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNEXPECTED_FILE',
          message: 'Unexpected file field or too many files',
          maxFiles: 5
        },
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    }
    
    next(error);
  });
};



/**
 * Configure tenant and logging middleware - ENHANCED FOR FILE UPLOADS
 */
const configureTenantAndLogging = (app, deploymentInfo) => {
  app.use((req, res, next) => {
    const skipTenantPaths = [
      "/api-docs",
      "/docs",
      "/api-docs.json",
      "/health",           // All health endpoints
      "/status",
      "/favicon.ico",
      "/postman",          // Postman collection downloads
      "/robots.txt",       // SEO robots file
      "/api/v1/files/test" // ✅ ADD: Allow file upload test endpoint
    ];

    const shouldSkipTenant = skipTenantPaths.some(
      (path) => req.path === path || req.path.startsWith(`${path}/`),
    );

    if (shouldSkipTenant) {
      req.context = req.context || {};
      req.context.tenantId =
        baseConfig.multiTenant?.defaultTenantId || "default";
      req.context.isPublic = true;
      req.context.deployment = deploymentInfo;

      // ✅ ENHANCED: Better logging for different endpoint types
      if (req.path.startsWith('/health')) {
        logger.debug(`🏥 Health check endpoint accessed: ${req.path}`, {
          requestId: req.requestId,
          userAgent: req.get("User-Agent"),
        });
      } else if (req.path.startsWith('/api/v1/files')) {
        logger.debug(`📁 File service endpoint accessed: ${req.path}`, {
          requestId: req.requestId,
          userAgent: req.get("User-Agent"),
        });
      } else {
        logger.debug(`📖 Public documentation endpoint accessed: ${req.path}`, {
          requestId: req.requestId,
          userAgent: req.get("User-Agent"),
        });
      }

      return next();
    }

    return tenantMiddleware(req, res, next);
  });

  // Rest of the function remains the same...
  app.use(async (req, res, next) => {
    try {
      if (!deploymentInfo.isServerless) {
        await AuditService.log("REQUEST_START", {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          tenantId: req.context?.tenantId,
          userAgent: req.get("User-Agent"),
          ip: req.ip,
        });
      }

      logger.debug(`${req.method} ${req.path}`, {
        requestId: req.requestId,
        tenantId: req.context?.tenantId,
        platform: deploymentInfo.platform,
      });
    } catch (error) {
      logger.warn("Failed to log request start", { error: error.message });
    }

    next();
  });
};




// Import docs routes
const configureApiRoutes = async (app) => {
  try {
    // ✅ ADD: Health routes first (for detailed health checks)
    app.use('/health', healthRoutes);

    // Existing API routes
    const apiRoutes = await import("#routes/api.routes.js");
    app.use("/api/v1", apiRoutes.default || apiRoutes);

    // Add docs routes
    try {
      const docsRoutes = await import("#routes/docs.routes.js");
      app.use("/", docsRoutes.default || docsRoutes);
    } catch (docsError) {
      logger.warn("Docs routes not found, skipping...", docsError.message);
    }

    logger.info("✅ All routes configured successfully");

  } catch (error) {
    logger.error("Failed to load routes", error);
  }
};


const createApp = async () => {
  try {
    const app = express();
    const deploymentInfo = getDeploymentInfo();

    logger.info(
      `🔧 Configuring app for ${deploymentInfo.platform} deployment`,
      deploymentInfo,
    );

    if (deploymentInfo.isServerless) {
      app.set("trust proxy", true);
    }

    app.use(passport.initialize());
    app.use(requestId);

    configureSecurity(app, deploymentInfo);
    configureCors(app, deploymentInfo);
    configureBodyParsing(app, deploymentInfo);
    configureCompression(app, deploymentInfo);
    configureRateLimiting(app, deploymentInfo);
    configurePublicRoutes(app, deploymentInfo);
    await configureSwagger(app, deploymentInfo);
    configureFileUpload(app, deploymentInfo); // ✅ ADD: File upload config
    configureTenantAndLogging(app, deploymentInfo);
    await configureApiRoutes(app, deploymentInfo);

    // Rest remains the same...
    app.all("*", (req, res) => {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: "ROUTE_NOT_FOUND",
          message: `Route ${req.originalUrl} not found`,
        },
        deployment: deploymentInfo,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    });

    app.use(errorHandler);

    logger.info(
      `✅ Express app initialized for ${deploymentInfo.platform} deployment`,
    );

    return app;
  } catch (error) {
    logger.error("Failed to create Express app", error);
    throw error;
  }
};


export default createApp;