// src/app.js - Enhanced for hybrid deployment with better error handling - FIXED VERSION
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import hpp from "hpp";
import passport from "passport";
import { logger } from "#utils/core/logger.js";
import baseConfig from "#shared/config/environments/base.config.js";
import { requestId } from "#shared/middleware/global/request-id.middleware.js";
import { tenantMiddleware } from "#core/tenant/middleware/tenant.middleware.js";
import { errorHandler } from "#shared/middleware/error-handling/error-handler.middleware.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import HTTP_STATUS from "#constants/http-status.js";
import redoc from "redoc-express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

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
 * Configure public routes
 */
/**
 * Configure public routes
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
        status: '/status',
        apiDocs: '/api-docs',
        api: '/api/v1'
      },
      timestamp: new Date().toISOString()
    });
  });

  // Health endpoint
  app.get('/health', (req, res) => {
    const healthCheck = {
      status: 'healthy',
      uptime: process.uptime(),
      environment: baseConfig.env,
      deployment: deploymentInfo,
      version: baseConfig.versioning?.currentApiVersion || '1.0.0',
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
    res.status(HTTP_STATUS.OK).json(healthCheck);
  });

  // Status endpoint
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
 * Configure Swagger documentation - BULLETPROOF SERVERLESS VERSION
 */
const configureSwagger = (app, deploymentInfo) => {
  const swaggerOptions = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "School Management System API",
        version: "1.0.0",
        description: "Multi-tenant School Management System API",
        contact: {
          name: "Development Team",
          email: "dev-team@yourschoolsystem.com",
        },
      },
      servers: [
        {
          url: deploymentInfo.isServerless ?
            `https://${process.env.VERCEL_URL || 'school-saas-ten.vercel.app'}` :
            'http://localhost:3000',
          description: `${deploymentInfo.platform} server`,
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
          tenantHeader: {
            type: "apiKey",
            in: "header",
            name: "X-Tenant-ID",
          },
        },
      },
    },
    apis: [
      "./src/api/v1/**/*.js",
      "./src/routes/**/*.js",
    ],
  };

  let swaggerDocs;
  try {
    swaggerDocs = swaggerJsdoc(swaggerOptions);
  } catch (error) {
    logger.error("Failed to generate Swagger docs", error);
    swaggerDocs = {
      openapi: "3.0.0",
      info: { title: "School Management API", version: "1.0.0" },
      paths: {
        "/health": {
          "get": {
            "summary": "Health Check",
            "responses": {
              "200": {
                "description": "System is healthy"
              }
            }
          }
        }
      },
    };
  }

  // ✅ BULLETPROOF: Custom Swagger UI implementation
  app.get('/api-docs', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>School Management API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgo=" sizes="32x32" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      display: none;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    // ✅ FIXED: Proper initialization with error handling
    window.onload = function() {
      try {
        // Check if SwaggerUIBundle is available
        if (typeof SwaggerUIBundle === 'undefined') {
          document.getElementById('swagger-ui').innerHTML = 
            '<h2>Loading Swagger UI...</h2><p>Please wait while the documentation loads.</p>';
          return;
        }

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
          persistAuthorization: true,
          displayRequestDuration: true,
          docExpansion: 'list',
          filter: true,
          tryItOutEnabled: true,
          // ✅ KEY FIX: Disable problematic features
          showExtensions: false,
          showCommonExtensions: false,
          onComplete: function() {
            console.log('Swagger UI loaded successfully');
          },
          onFailure: function(error) {
            console.error('Swagger UI failed to load:', error);
            document.getElementById('swagger-ui').innerHTML = 
              '<h2>Error Loading API Documentation</h2><p>Please try refreshing the page.</p>';
          }
        });

        // Store reference globally
        window.ui = ui;
        
      } catch (error) {
        console.error('Error initializing Swagger UI:', error);
        document.getElementById('swagger-ui').innerHTML = 
          '<h2>Error Loading API Documentation</h2><p>' + error.message + '</p>';
      }
    };

    // ✅ Fallback if window.onload doesn't fire
    setTimeout(function() {
      if (!window.ui && typeof SwaggerUIBundle !== 'undefined') {
        window.onload();
      }
    }, 2000);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(swaggerHtml);
  });

  // ✅ JSON endpoint with CORS headers
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.json(swaggerDocs);
  });

  // ✅ Simple ReDoc alternative
  app.get("/docs", (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const redocHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>School Management API Documentation</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="redoc-container"></div>
  <script src="https://cdn.jsdelivr.net/npm/redoc@2.1.2/bundles/redoc.standalone.js"></script>
  <script>
    Redoc.init('${baseUrl}/api-docs.json', {
      theme: {
        colors: {
          primary: {
            main: '#1976d2'
          }
        }
      }
    }, document.getElementById('redoc-container'));
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(redocHtml);
  });

  logger.info('📚 Swagger UI configured for ' + deploymentInfo.platform);
};




/**
 * Configure tenant and logging middleware
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
      return next();
    }

    return tenantMiddleware(req, res, next);
  });

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

/**
 * Configure API routes
 */
const configureApiRoutes = async (app, deploymentInfo) => {
  try {
    const apiRoutes = await import("#routes/api.routes.js");
    app.use("/api/v1", apiRoutes.default || apiRoutes);
  } catch (error) {
    logger.error("Failed to load API routes", error);
    app.use("/api/v1", (req, res) => {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "API routes are temporarily unavailable",
        },
      });
    });
  }
};

/**
 * Creates and configures Express application with hybrid deployment support
 */
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
    configureSwagger(app, deploymentInfo);
    configureTenantAndLogging(app, deploymentInfo);
    await configureApiRoutes(app, deploymentInfo);

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