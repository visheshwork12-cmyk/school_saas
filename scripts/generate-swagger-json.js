// scripts/generate-swagger-json.js

import fs from 'fs';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'School Management System API',
      version: '1.0.0',
      description: 'Complete API documentation'
    }
  },
  apis: ['./src/api/v1/**/*.js']
};

try {
  const specs = swaggerJsdoc(swaggerOptions);
  
  // Create docs directory if not exists
  const docsDir = './docs/api';
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  
  // Write OpenAPI JSON
  fs.writeFileSync(
    path.join(docsDir, 'openapi.json'), 
    JSON.stringify(specs, null, 2)
  );
  
  console.log('✅ OpenAPI JSON generated successfully');
} catch (error) {
  console.error('❌ Error generating OpenAPI JSON:', error.message);
}
