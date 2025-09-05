// docs/api/swagger-config.js - COMPLETE FIXED VERSION
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "School Management System API",
      version: "1.0.0",
      description: "Multi-tenant School Management System API",
    },
    servers: [
      {
        url: process.env.API_BASE_URL || "https://school-saas-ten.vercel.app",
        description: "Production server",
      },
      {
        url: "http://localhost:3000",
        description: "Development server",
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
  // ✅ FIXED: Correct file paths
  apis: [
    "./src/api/v1/**/*.js",                     // All API v1 files
    "./src/api/v1/**/**/*.js",                  // Nested API files  
    "./src/routes/**/*.js",                     // Route files
    "./src/**/*routes*.js",
    "./src/api/v1/school/auth/routes/*.js",     // Specific auth routes
    "./src/api/v1/shared/files/routes/*.js",    // Specific file routes
    "./docs/api/examples/**/*.md",              // Example docs
  ],
};

export const generateSwaggerSpec = () => {
  try {
    const spec = swaggerJsdoc(swaggerOptions);
    console.log('✅ Swagger spec generated successfully');
    console.log('📄 Found paths:', Object.keys(spec.paths || {}));
    return spec;
  } catch (error) {
    console.error('❌ Failed to generate Swagger spec:', error);
    return {
      openapi: "3.0.0",
      info: { title: "School Management API", version: "1.0.0" },
      paths: {},
    };
  }
};
