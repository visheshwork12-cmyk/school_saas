// docs/api/swagger-config.js
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
      contact: {
        name: "Development Team",
        email: "dev-team@yourschoolsystem.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
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
  apis: [
    "./src/api/v1/**/*.js",
    "./src/routes/**/*.js",
    "./docs/api/examples/**/*.md",  // ← Include examples from docs
  ],
};

export const generateSwaggerSpec = () => {
  try {
    return swaggerJsdoc(swaggerOptions);
  } catch (error) {
    console.error('Failed to generate Swagger spec:', error);
    return {
      openapi: "3.0.0",
      info: { title: "School Management API", version: "1.0.0" },
      paths: {},
    };
  }
};
