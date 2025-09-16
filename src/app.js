// src/app.js - IDEAL MERGED VERSION with best features from both
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { logger } from "#utils/core/logger.js";
import baseConfig from "#shared/config/environments/base.config.js";
import { requestId } from "#shared/middleware/global/request-id.middleware.js";
import { tenantMiddleware } from "#core/tenant/middleware/tenant.middleware.js";
import { errorHandler } from "#shared/middleware/error-handling/error-handler.middleware.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import HTTP_STATUS from "#constants/http-status.js";
import healthRoutes from '#routes/health.routes.js';
import { requestMetricsMiddleware } from '#shared/middleware/monitoring/request-metrics.middleware.js';
import { cloudWatchService } from '#core/monitoring/services/cloudwatch.service.js';

// 🔧 SENTRY INITIALIZATION - Enhanced with better error handling
let Sentry = null;
let sentryEnabled = false;

try {
  // Only import and initialize Sentry if DSN is provided
  if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
    const sentryModule = await import('@sentry/node');
    Sentry = sentryModule.default || sentryModule;

    // Initialize Sentry
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: process.env.NODE_ENV === 'development',
      beforeSend(event) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Sentry Event:', event.message || event.exception);
        }
        return event;
      },
    });

    sentryEnabled = true;
    logger.info('✅ Sentry initialized successfully');
  } else {
    logger.info('ℹ️ Sentry not configured (no DSN provided or test environment)');
  }
} catch (error) {
  logger.warn('⚠️ Failed to initialize Sentry:', error.message);
  logger.info('📝 App will continue without Sentry monitoring');
}

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
 * Configure Sentry middleware - Enhanced with better safety checks
 */
const configureSentryMiddleware = async (app) => {
  if (!sentryEnabled) {
    logger.debug('🚫 Skipping Sentry middleware (not enabled)');
    return false;
  }

  try {
    // Double-check Sentry availability
    if (!Sentry || !Sentry.Handlers) {
      logger.warn('⚠️ Sentry handlers not available');
      return false;
    }

    // Request handler
    app.use(Sentry.Handlers.requestHandler({
      user: ['id', 'email', 'username'],
      request: ['method', 'url', 'headers', 'query'],
      serverName: false,
    }));

    // Tracing handler
    app.use(Sentry.Handlers.tracingHandler());

    logger.info('✅ Sentry middleware configured successfully');
    return true;
  } catch (error) {
    logger.warn('⚠️ Failed to configure Sentry middleware:', error.message);
    return false;
  }
};

/**
 * Configure Sentry error handler - Enhanced
 */
const configureSentryErrorHandler = (app) => {
  if (!sentryEnabled || !Sentry?.Handlers) {
    logger.debug('🚫 Skipping Sentry error handler (not enabled)');
    return;
  }

  try {
    app.use(Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Only capture server errors (5xx) and some 4xx errors
        return !error.status || error.status >= 500 || error.status === 401 || error.status === 403;
      },
    }));

    logger.info('✅ Sentry error handler configured');
  } catch (error) {
    logger.warn('⚠️ Failed to configure Sentry error handler:', error.message);
  }
};

/**
 * Configure security middleware - Enhanced for Swagger UI
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
            "https://unpkg.com",
            "https://cdn.jsdelivr.net"
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
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
};

/**
 * Configure CORS - Enhanced with fallbacks
 */
const configureCors = (app, deploymentInfo) => {
  const corsOptions = {
    origin: (origin, callback) => {
      if (deploymentInfo.isServerless) {
        callback(null, true);
      } else {
        const allowedOrigins = baseConfig.cors?.allowedOrigins || [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:5173'  // Vite default
        ];

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
    methods: baseConfig.cors?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
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
 * Configure body parsing - Enhanced
 */
const configureBodyParsing = (app, deploymentInfo) => {
  const jsonLimit = deploymentInfo.isServerless
    ? "10mb"
    : baseConfig.bodyParser?.jsonLimit || "10mb";
  const urlencodedLimit = deploymentInfo.isServerless
    ? "10mb"
    : baseConfig.bodyParser?.urlencodedLimit || "10mb";

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
 * Configure compression - Enhanced
 */
const configureCompression = (app, deploymentInfo) => {
  app.use(
    compression({
      level: deploymentInfo.isServerless ? 1 : baseConfig.compression?.level || 6,
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
 * Configure rate limiting - Enhanced
 */
const configureRateLimiting = (app, deploymentInfo) => {
  const createRateLimiter = () =>
    rateLimit({
      windowMs: deploymentInfo.isServerless
        ? 60000
        : baseConfig.rateLimit?.windowMs || 900000, // 15 minutes default
      max: deploymentInfo.isServerless ? 200 : baseConfig.rateLimit?.max || 100,
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
        const skipPaths = ["/health", "/status", "/api-docs", "/docs", "/favicon.ico"];
        return skipPaths.some((path) => req.path.startsWith(path));
      },
      keyGenerator: (req) => {
        return `${req.ip}:${req.get("User-Agent") || "unknown"}`;
      },
      handler: async (req, res) => {
        try {
          await AuditService.log("RATE_LIMIT_EXCEEDED", {
            ip: req.ip,
            path: req.path,
            userAgent: req.get("User-Agent"),
          });
        } catch (error) {
          logger.debug("Failed to log rate limit event", error.message);
        }

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
 * Configure public routes - Enhanced with Cloudinary health
 */
const configurePublicRoutes = (app, deploymentInfo) => {
  // Root route
  app.get('/', (req, res) => {
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Welcome to School ERP SaaS API',
      version: baseConfig.versioning?.currentApiVersion || '1.0.0',
      environment: baseConfig.env || process.env.NODE_ENV || 'development',
      deployment: deploymentInfo,
      monitoring: {
        sentry: sentryEnabled ? 'enabled' : 'disabled',
      },
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

  // Enhanced Health endpoint with Cloudinary status
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
        environment: baseConfig.env || process.env.NODE_ENV,
        deployment: deploymentInfo,
        version: baseConfig.versioning?.currentApiVersion || '1.0.0',
        timestamp: new Date().toISOString(),
        services: {
          api: 'healthy',
          sentry: sentryEnabled ? 'enabled' : 'disabled',
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

  // Status endpoint
  app.get('/status', (req, res) => {
    res.status(HTTP_STATUS.OK).json({
      status: 'OK',
      uptime: process.uptime(),
      environment: baseConfig.env || process.env.NODE_ENV,
      platform: deploymentInfo.platform,
      serverless: deploymentInfo.isServerless,
      monitoring: {
        sentry: sentryEnabled,
      },
      timestamp: new Date().toISOString()
    });
  });
};

/**
 * Configure Enhanced Swagger documentation with Postman integration
 */
const configureSwagger = async (app, deploymentInfo) => {
  try {
    let swaggerSpec;
    let existingCollections = [];

    // Try to load OpenAPI spec from multiple sources
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const yaml = await import('js-yaml');

      try {
        // Try to load from OpenAPI YAML first
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
          // Final fallback to enhanced basic spec
          swaggerSpec = {
            openapi: "3.0.0",
            info: {
              title: "School Management API",
              version: "1.0.0",
              description: "School ERP SaaS API Documentation",
              contact: {
                name: "API Support",
                email: "support@schoolerp.com"
              }
            },
            servers: [
              {
                url: "/api/v1",
                description: `${deploymentInfo.environment} server`
              }
            ],
            paths: {
              "/health": {
                "get": {
                  "summary": "Health Check",
                  "tags": ["System"],
                  "responses": {
                    "200": { "description": "System is healthy" },
                    "503": { "description": "System is unhealthy" }
                  }
                }
              },
              "/status": {
                "get": {
                  "summary": "System Status",
                  "tags": ["System"],
                  "responses": {
                    "200": { "description": "System status information" }
                  }
                }
              }
            }
          };
          logger.warn('⚠️ Using enhanced fallback swagger spec');
        }
      }

      // Check for Postman collections
      try {
        const collections = ['platform-apis.json', 'school-apis.json', 'product-apis.json'];
        for (const collection of collections) {
          try {
            const filePath = path.join(process.cwd(), 'docs/api/postman', collection);
            await fs.access(filePath);
            existingCollections.push(collection);
          } catch (error) {
            // Collection doesn't exist
          }
        }
      } catch (error) {
        logger.debug('Could not check for Postman collections');
      }

    } catch (importError) {
      // Fallback if fs/path/yaml imports fail
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
    }

    // Serve OpenAPI JSON spec
    app.get("/api-docs.json", (req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(swaggerSpec);
    });

    // Serve Postman Collections (if available)
    if (existingCollections.length > 0) {
      app.get('/postman/:collection', async (req, res) => {
        try {
          const { collection } = req.params;
          const allowedCollections = ['platform-apis', 'school-apis', 'product-apis'];

          if (!allowedCollections.includes(collection)) {
            return res.status(400).json({ error: 'Invalid collection name' });
          }

          const fs = await import('fs/promises');
          const path = await import('path');
          const filePath = path.join(process.cwd(), 'docs/api/postman', `${collection}.json`);
          const content = await fs.readFile(filePath, 'utf-8');

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${collection}.json"`);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.send(content);

          logger.info(`📬 Postman collection downloaded: ${collection}.json`);
        } catch (error) {
          logger.error(`Failed to serve Postman collection: ${collection}`, error);
          res.status(404).json({
            error: 'Collection not found. Run "npm run docs:postman" to generate collections.'
          });
        }
      });
    }

    // Enhanced Swagger UI with conditional Postman integration
    app.get('/api-docs', (req, res) => {
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const postmanSection = existingCollections.length > 0 ? `
      <!-- Postman Collections Section -->
      <div class="postman-section">
        <h3>📬 Postman Collections</h3>
        <p>Download ready-to-use Postman collections for testing APIs:</p>
        <div style="margin: 15px 0;">
          ${existingCollections.map(collection => {
        const name = collection.replace('.json', '');
        const displayName = name.split('-').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        return `<a href="${baseUrl}/postman/${name}" class="postman-link" target="_blank">
              📋 ${displayName} <span class="status-badge">Ready</span>
            </a>`;
      }).join('')}
        </div>
      </div>` : '';

      const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>School Management API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    .swagger-ui .topbar { display: none; }
    .header-section {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header-section h1 {
      margin: 0 0 10px 0;
      font-size: 2.5em;
      font-weight: 300;
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
    }
    .postman-link:hover {
      background: #e55a2b;
      transform: translateY(-2px);
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
  </style>
</head>
<body>
  <div class="header-section">
    <h1>🎓 School ERP SaaS API</h1>
    <p>Environment: ${deploymentInfo.environment} | Monitoring: ${sentryEnabled ? 'Enabled' : 'Disabled'}</p>
  </div>
  
  ${postmanSection}
  
  <div id="swagger-ui"></div>
  
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${baseUrl}/api-docs.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: "BaseLayout",
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
      displayRequestDuration: true,
    });
  </script>
</body>
</html>`;
      res.send(swaggerHtml);
    });

    logger.info(`📚 Enhanced Swagger UI configured (${existingCollections.length}/3 Postman collections available)`);
  } catch (error) {
    logger.error('Failed to configure enhanced Swagger:', error);

    // Minimal fallback
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
  }
};

/**
 * Configure file upload specific middleware
 */
const configureFileUpload = (app, deploymentInfo) => {
  // Handle multipart/form-data errors specifically for file upload routes
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
 * Configure tenant and logging middleware - Enhanced for file uploads
 */
const configureTenantAndLogging = (app, deploymentInfo) => {
  app.use((req, res, next) => {
    const skipTenantPaths = [
      "/api-docs",
      "/docs",
      "/api-docs.json",
      "/health",
      "/status",
      "/favicon.ico",
      "/postman",
      "/robots.txt",
      "/api/v1/files/test", // Allow file upload test endpoint
      "/api/v1/test"
    ];

    const shouldSkipTenant = skipTenantPaths.some(
      (path) => req.path === path || req.path.startsWith(`${path}/`),
    );

    if (shouldSkipTenant) {
      req.context = req.context || {};
      req.context.tenantId = baseConfig.multiTenant?.defaultTenantId || "default";
      req.context.isPublic = true;
      req.context.deployment = deploymentInfo;

      // Enhanced logging for different endpoint types
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
      } else if (req.path.startsWith('/api-docs') || req.path.startsWith('/postman')) {
        logger.debug(`📖 Documentation endpoint accessed: ${req.path}`, {
          requestId: req.requestId,
          userAgent: req.get("User-Agent"),
        });
      }

      return next();
    }

    // Use tenant middleware for other routes
    return tenantMiddleware(req, res, next);
  });

  // Request logging middleware
  app.use(async (req, res, next) => {
    try {
      // Log request start for audit purposes (skip for serverless to avoid cold start delays)
      if (!deploymentInfo.isServerless) {
        await AuditService.log("REQUEST_START", {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          tenantId: req.context?.tenantId,
          userAgent: req.get("User-Agent"),
          ip: req.ip,
        }).catch(() => { }); // Silent catch to avoid breaking requests
      }

      logger.debug(`${req.method} ${req.path}`, {
        requestId: req.requestId,
        tenantId: req.context?.tenantId,
        platform: deploymentInfo.platform,
      });
    } catch (error) {
      logger.debug("Failed to log request", { error: error.message });
    }
    next();
  });
};

/**
 * Configure API routes - Enhanced
 */
const configureApiRoutes = async (app) => {
  try {
    // Health routes first (detailed health checks)
    app.use('/health', healthRoutes);

    // Main API routes
    try {
      const apiRoutes = await import("#routes/api.routes.js");
      app.use("/api/v1", apiRoutes.default || apiRoutes);
      logger.info("✅ API routes configured");
    } catch (error) {
      logger.warn("⚠️ API routes not found:", error.message);

      // Create a basic test route if main routes are missing
      app.get("/api/v1/test", (req, res) => {
        res.json({
          success: true,
          message: "API is working",
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        });
      });
    }

    // Documentation routes (optional)
    try {
      const docsRoutes = await import("#routes/docs.routes.js");
      app.use("/", docsRoutes.default || docsRoutes);
      logger.info("✅ Docs routes configured");
    } catch (docsError) {
      logger.debug("ℹ️ Docs routes not found, skipping...");
    }

  } catch (error) {
    logger.error("Failed to configure routes:", error);
  }
};

/**
 * Not found middleware
 */
const notFoundMiddleware = (req, res) => {
  const deploymentInfo = getDeploymentInfo();
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
};

/**
 * Error handler middleware - Enhanced
 */
const errorHandlerMiddleware = (error, req, res, next) => {
  logger.error('Application error:', {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });

  // Capture error with Sentry if available
  if (sentryEnabled && Sentry) {
    try {
      Sentry.withScope((scope) => {
        scope.setTag('component', 'express-error-handler');
        scope.setContext('request', {
          method: req.method,
          url: req.url,
          headers: req.headers,
        });
        Sentry.captureException(error);
      });
    } catch (sentryError) {
      logger.debug('Failed to capture error with Sentry:', sentryError.message);
    }
  }

  if (res.headersSent) {
    return next(error);
  }

  // Determine error status and message
  const status = error.status || error.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(status).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: isDevelopment ? error.message : 'Something went wrong',
      ...(isDevelopment && { stack: error.stack }),
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
};

/**
 * Main app creation function - IDEAL VERSION
 */
const createApp = async () => {
  try {
    const app = express();
    const deploymentInfo = getDeploymentInfo();

    logger.info(
      `🔧 Configuring app for ${deploymentInfo.platform} deployment`,
      { ...deploymentInfo, sentryEnabled }
    );

    // Trust proxy for serverless environments
    if (deploymentInfo.isServerless) {
      app.set("trust proxy", true);
    }

    // Configure middleware in optimal order
    await configureSentryMiddleware(app);    // 1. Sentry request handler (if available)
    app.use(requestMetricsMiddleware);
    app.use(passport.initialize());          // 2. Passport
    app.use(requestId);                      // 3. Request ID

    configureSecurity(app, deploymentInfo);   // 4. Security (Helmet)
    configureCors(app, deploymentInfo);       // 5. CORS
    configureBodyParsing(app, deploymentInfo); // 6. Body parsing
    configureCompression(app, deploymentInfo); // 7. Compression
    configureRateLimiting(app, deploymentInfo); // 8. Rate limiting

    configurePublicRoutes(app, deploymentInfo); // 9. Public routes
    await configureSwagger(app, deploymentInfo); // 10. Enhanced Swagger docs
    configureFileUpload(app, deploymentInfo);  // 11. File upload middleware

    configureTenantAndLogging(app, deploymentInfo); // 12. Tenant & logging
    await configureApiRoutes(app);             // 13. API routes

    // Error handling middleware (must be last)
    configureSentryErrorHandler(app);          // 14. Sentry error handler (if available)
    app.use(notFoundMiddleware);               // 15. 404 handler
    app.use(errorHandlerMiddleware);

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await cloudWatchService.shutdown();
      process.exit(0);
    });// 16. Final error handler

    logger.info(
      `✅ Express app initialized successfully for ${deploymentInfo.platform} deployment`,
      {
        sentryEnabled,
        features: {
          security: true,
          cors: true,
          compression: true,
          rateLimit: true,
          swagger: true,
          fileUpload: true,
          multiTenant: true
        }
      }
    );

    return app;
  } catch (error) {
    logger.error("Failed to create Express app:", error);
    throw error;
  }
};

export default createApp;
