// src/app.js - Enhanced for hybrid deployment with better error handling - FIXED VERSION
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import passport from 'passport';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { requestId } from '#shared/middleware/global/request-id.middleware.js';
import { tenantMiddleware } from '#core/tenant/middleware/tenant.middleware.js';
import { errorHandler } from '#shared/middleware/error-handling/error-handler.middleware.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import HTTP_STATUS from '#constants/http-status.js';
import redoc from 'redoc-express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

/**
 * Detect deployment environment with enhanced detection
 */
const getDeploymentInfo = () => {
  const isServerless = Boolean(
    process.env.DEPLOYMENT_TYPE === 'serverless' ||
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME // Google Cloud Functions
  );

  const platform = process.env.VERCEL ? 'vercel' :
    process.env.NETLIFY ? 'netlify' :
      process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' :
        process.env.FUNCTION_NAME ? 'gcp-functions' :
          'traditional';

  return {
    isServerless,
    platform,
    environment: process.env.NODE_ENV || 'development',
    region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown'
  };
};

/**
 * Creates and configures Express application with hybrid deployment support
 * @returns {Promise<Object>} Configured Express app
 */
const createApp = async () => {
  try {
    const app = express();
    const deploymentInfo = getDeploymentInfo();

    logger.info(`🔧 Configuring app for ${deploymentInfo.platform} deployment`, deploymentInfo);

    // Trust proxy for serverless environments
    if (deploymentInfo.isServerless) {
      app.set('trust proxy', true);
    }

    // Initialize Passport for JWT authentication
    app.use(passport.initialize());

    // Request ID for tracing (should be first)
    app.use(requestId);

    // Enhanced security middleware
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", 'data:', 'https:', baseConfig.aws?.s3Bucket || '*'],
            connectSrc: ["'self'", baseConfig.redis?.url || '*'],
            fontSrc: ["'self'", 'data:', "https://fonts.gstatic.com"],
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

    // Enhanced CORS configuration - FIXED
    const corsOptions = {
      origin: (origin, callback) => {
        if (deploymentInfo.isServerless) {
          // More permissive for serverless
          callback(null, true);
        } else {
          const { allowedOrigins } = baseConfig.cors;
          if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      },
      methods: baseConfig.cors.methods, // Now properly configured as array in base config
      credentials: !deploymentInfo.isServerless,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Tenant-ID',
        'X-School-ID',
        'X-Requested-With',
        'X-Request-ID',
        'Accept',
        'Origin'
      ],
      maxAge: 86400 // Cache preflight for 24 hours
    };

    app.use(cors(corsOptions));

    // Security sanitization
    app.use(mongoSanitize({
      replaceWith: '_',
      onSanitize: ({ req, key }) => {
        logger.warn('Data sanitized', { key, path: req.path });
      }
    }));
    app.use(xss());
    app.use(hpp());

    // Body parsing with enhanced limits
    const jsonLimit = deploymentInfo.isServerless ? '10mb' : baseConfig.bodyParser.jsonLimit;
    const urlencodedLimit = deploymentInfo.isServerless ? '10mb' : baseConfig.bodyParser.urlencodedLimit;

    app.use(express.json({
      limit: jsonLimit,
      verify: (req, res, buf, encoding) => {
        if (buf.length > 50 * 1024 * 1024) { // 50MB hard limit
          throw new Error('Request entity too large');
        }
      }
    }));
    app.use(express.urlencoded({
      extended: true,
      limit: urlencodedLimit
    }));

    // Compression with conditional settings
    app.use(compression({
      level: deploymentInfo.isServerless ? 1 : baseConfig.compression.level,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      }
    }));

    // Enhanced rate limiting
    const createRateLimiter = () => rateLimit({
      windowMs: deploymentInfo.isServerless ? 60000 : baseConfig.rateLimit.windowMs,
      max: deploymentInfo.isServerless ? 200 : baseConfig.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later',
        },
      },
      skip: (req) => {
        const skipPaths = ['/health', '/status', '/api-docs', '/docs'];
        return skipPaths.some(path => req.path.startsWith(path));
      },
      keyGenerator: (req) => {
        return `${req.ip}:${req.get('User-Agent') || 'unknown'}`;
      },
      handler: async (req, res) => {
        await AuditService.log('RATE_LIMIT_EXCEEDED', {
          ip: req.ip,
          path: req.path,
          userAgent: req.get('User-Agent')
        }).catch(() => {}); // Silent fail for audit

        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests from this IP, please try again later',
          },
        });
      }
    });

    app.use(createRateLimiter());

    // 🔹 PUBLIC ROUTES - Before tenant middleware

    // Enhanced health endpoint
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
        timestamp: new Date().toISOString(),
      });
    });

    // Enhanced Swagger configuration
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'School Management System API',
          version: '1.0.0',
          description: `
## Multi-tenant School Management System API

**Deployment**: ${deploymentInfo.platform} (${deploymentInfo.isServerless ? 'Serverless' : 'Traditional'})
**Environment**: ${deploymentInfo.environment}

### Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

### Tenant Context
For multi-tenant endpoints, include the school/tenant ID in the header:
\`\`\`
X-Tenant-ID: <your-school-id>
\`\`\`
          `,
          contact: {
            name: 'Development Team',
            email: 'dev-team@yourschoolsystem.com'
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          }
        },
        servers: [
          {
            url: process.env.API_BASE_URL || (deploymentInfo.isServerless ?
              'https://your-project.vercel.app' : 'http://localhost:3000'),
            description: `${deploymentInfo.platform} server`
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            },
            tenantHeader: {
              type: 'apiKey',
              in: 'header',
              name: 'X-Tenant-ID'
            }
          }
        }
      },
      apis: [
        './src/api/v1/**/*.js',
        './src/api/v1/**/*.controller.js',
        './src/routes/**/*.js'
      ]
    };

    let swaggerDocs;
    try {
      swaggerDocs = swaggerJsdoc(swaggerOptions);
    } catch (error) {
      logger.error('Failed to generate Swagger docs', error);
      swaggerDocs = { openapi: '3.0.0', info: { title: 'API', version: '1.0.0' }, paths: {} };
    }

    // Conditionally enable documentation
    const enableDocs = !deploymentInfo.isServerless ||
      process.env.ENABLE_DOCS === 'true' ||
      deploymentInfo.environment === 'development';

    if (enableDocs) {
      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
        explorer: true,
        customSiteTitle: "School Management API Documentation",
        customCss: '.swagger-ui .topbar { display: none }',
        swaggerOptions: {
          persistAuthorization: true,
          displayRequestDuration: true,
          docExpansion: 'list',
          filter: true,
          tryItOutEnabled: true
        }
      }));

      app.get('/docs', redoc({
        title: 'School Management API Documentation',
        specUrl: '/api-docs.json',
        redocOptions: {
          theme: {
            colors: {
              primary: {
                main: '#1976d2'
              }
            }
          }
        }
      }));
    }

    app.get('/api-docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(swaggerDocs);
    });

    // 🔹 TENANT MIDDLEWARE - Applied after public routes
    app.use((req, res, next) => {
      const skipTenantPaths = [
        '/api-docs',
        '/docs',
        '/api-docs.json',
        '/health',
        '/status',
        '/favicon.ico'
      ];

      const shouldSkipTenant = skipTenantPaths.some(path =>
        req.path === path || req.path.startsWith(`${path}/`)
      );

      if (shouldSkipTenant) {
        req.context = req.context || {};
        req.context.tenantId = baseConfig.multiTenant?.defaultTenantId || 'default';
        req.context.isPublic = true;
        req.context.deployment = deploymentInfo;
        return next();
      }

      // Apply tenant middleware for protected routes
      return tenantMiddleware(req, res, next);
    });

    // Request logging middleware (optimized for serverless)
    app.use(async (req, res, next) => {
      try {
        if (!deploymentInfo.isServerless) {
          // Full logging for traditional deployment
          await AuditService.log('REQUEST_START', {
            requestId: req.requestId,
            method: req.method,
            path: req.path,
            tenantId: req.context?.tenantId,
            userAgent: req.get('User-Agent'),
            ip: req.ip
          });
        }

        logger.debug(`${req.method} ${req.path}`, {
          requestId: req.requestId,
          tenantId: req.context?.tenantId,
          platform: deploymentInfo.platform
        });
      } catch (error) {
        logger.warn('Failed to log request start', { error: error.message });
      }

      next();
    });

    // 🔹 API ROUTES
    try {
      const apiRoutes = await import('#routes/api.routes.js');
      app.use('/api/v1', apiRoutes.default || apiRoutes);
    } catch (error) {
      logger.error('Failed to load API routes', error);
      // Create fallback route
      app.use('/api/v1', (req, res) => {
        res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'API routes are temporarily unavailable'
          }
        });
      });
    }

    // 404 handler
    app.all('*', (req, res) => {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: `Route ${req.originalUrl} not found`,
        },
        deployment: deploymentInfo,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    });

    // Global error handler
    app.use(errorHandler);

    logger.info(`✅ Express app initialized for ${deploymentInfo.platform} deployment`);

    return app;

  } catch (error) {
    logger.error('Failed to create Express app', error);
    throw error;
  }
};

export default createApp;