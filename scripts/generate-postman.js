// scripts/generate-postman.js - SERVERLESS FIXED VERSION
import { convert } from 'openapi-to-postmanv2';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ FIXED: Detect serverless environment and use appropriate paths
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY;
const PROJECT_ROOT = isServerless ? '/tmp' : process.cwd();
const DOCS_PATH = isServerless ? '/tmp/docs' : path.join(__dirname, '../docs');
const POSTMAN_PATH = path.join(DOCS_PATH, 'api/postman');

console.log('🔧 Environment Detection:', {
  isServerless: !!isServerless,
  projectRoot: PROJECT_ROOT,
  docsPath: DOCS_PATH,
  postmanPath: POSTMAN_PATH,
  platform: process.env.VERCEL ? 'vercel' : process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' : 'local'
});

async function generatePostmanCollections() {
  console.log('🚀 Starting Postman collection generation...');
  console.log('📂 Project root:', PROJECT_ROOT);
  console.log('📂 Docs path:', DOCS_PATH);
  console.log('📂 Postman output path:', POSTMAN_PATH);

  try {
    // ✅ FIXED: Serverless-safe directory creation
    await ensureDirectoryExists(DOCS_PATH);
    await ensureDirectoryExists(POSTMAN_PATH);

    // ✅ FIXED: Handle OpenAPI spec more gracefully
    let openApiSpec;
    const openApiPath = path.join(DOCS_PATH, 'api/openapi.yaml');
    
    try {
      console.log('🔍 Looking for OpenAPI spec at:', openApiPath);
      const openApiContent = await fs.readFile(openApiPath, 'utf-8');
      openApiSpec = yaml.load(openApiContent);
      console.log('✅ OpenAPI spec loaded successfully');
    } catch (error) {
      console.log('❌ OpenAPI spec not found, creating minimal spec...');
      openApiSpec = createMinimalOpenApiSpec();
      
      // ✅ Only try to save if not in serverless environment
      if (!isServerless) {
        try {
          await ensureDirectoryExists(path.dirname(openApiPath));
          await fs.writeFile(openApiPath, yaml.dump(openApiSpec));
          console.log('✅ Minimal OpenAPI spec created at:', openApiPath);
        } catch (saveError) {
          console.warn('⚠️ Could not save OpenAPI spec (serverless environment):', saveError.message);
        }
      }
    }

    console.log('📝 Converting OpenAPI to Postman collections...');

    // Convert to Postman collection
    const result = await convertToPostmanCollection(openApiSpec);
    
    if (!result?.result || !result?.output?.[0]?.data) {
      throw new Error('No collection data generated from OpenAPI spec');
    }

    const collection = result.output[0].data;
    console.log('📦 Generated collection items:', collection.item?.length || 0);

    // Initialize collections
    const collections = {
      platform: createBaseCollection('Platform APIs - School ERP', 'Platform-level APIs'),
      school: createBaseCollection('School APIs - School ERP', 'School-specific APIs'),
      product: createBaseCollection('Product APIs - School ERP', 'Product feature APIs')
    };

    console.log('📋 Processing collection items...');

    // Process requests
    if (collection.item && Array.isArray(collection.item)) {
      collection.item.forEach((item, index) => {
        console.log(`📄 Processing item ${index + 1}: ${item.name || 'Unnamed'}`);
        processRequestItem(item, collections);
      });
    }

    // ✅ FIXED: Handle file saving based on environment
    console.log('💾 Saving Postman collections...');
    const savedFiles = await saveCollections(collections);

    console.log('✅ Postman collections generated successfully!');
    console.log(`📁 Platform APIs: ${collections.platform.item.length} requests`);
    console.log(`📁 School APIs: ${collections.school.item.length} requests`);
    console.log(`📁 Product APIs: ${collections.product.item.length} requests`);

    if (isServerless) {
      console.log('🔗 Serverless: Collections generated in memory (not persisted to disk)');
      // ✅ In serverless, return the collections directly
      return {
        platform: collections.platform,
        school: collections.school,
        product: collections.product,
        files: savedFiles
      };
    } else {
      console.log(`📂 Files saved to: ${POSTMAN_PATH}`);
      console.log('🔗 Saved files:', savedFiles);
      return savedFiles;
    }

  } catch (error) {
    console.error('❌ Error generating Postman collections:', error.message);
    console.error('📄 Stack trace:', error.stack);
    
    // ✅ FIXED: Don't exit process in serverless environment
    if (isServerless) {
      console.warn('⚠️ Continuing in serverless mode despite errors...');
      return null;
    } else {
      process.exit(1);
    }
  }
}

// ✅ NEW: Safe directory creation function
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
    console.log(`✅ Directory exists: ${dirPath}`);
  } catch (error) {
    console.log(`📁 Creating directory: ${dirPath}`);
    try {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`✅ Directory created: ${dirPath}`);
    } catch (createError) {
      if (createError.code === 'EEXIST') {
        console.log(`ℹ️ Directory already exists: ${dirPath}`);
      } else if (createError.code === 'EACCES' || createError.code === 'EPERM') {
        console.warn(`⚠️ Permission denied creating directory: ${dirPath}. Running in read-only environment.`);
        if (isServerless) {
          console.log('ℹ️ This is expected in serverless environments');
          return; // Don't throw in serverless
        }
      } else {
        console.error('❌ Error creating directory:', dirPath, createError);
        throw createError;
      }
    }
  }
}

// ✅ NEW: Extract minimal OpenAPI spec creation
function createMinimalOpenApiSpec() {
  return {
    openapi: "3.0.0",
    info: {
      title: "School Management System API",
      version: "1.0.0",
      description: "Auto-generated minimal API spec"
    },
    servers: [
      { url: "https://school-saas-ten.vercel.app", description: "Production" },
      { url: "http://localhost:3000", description: "Development" }
    ],
    paths: {
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health Check",
          responses: {
            "200": { description: "System is healthy" }
          }
        }
      },
      "/api/v1/platform/organizations": {
        get: {
          tags: ["Platform"],
          summary: "List Organizations",
          responses: {
            "200": { description: "Organizations list" }
          }
        },
        post: {
          tags: ["Platform"],
          summary: "Create Organization",
          responses: {
            "201": { description: "Organization created" }
          }
        }
      },
      "/api/v1/schools/{tenantId}/students": {
        get: {
          tags: ["School"],
          summary: "List Students",
          parameters: [
            {
              name: "tenantId",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            "200": { description: "Students list" }
          }
        }
      },
      "/api/v1/schools/{tenantId}/products/academic/exams": {
        get: {
          tags: ["Product"],
          summary: "List Exams",
          parameters: [
            {
              name: "tenantId",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            "200": { description: "Exams list" }
          }
        }
      }
    }
  };
}

// ✅ NEW: Extract Postman conversion logic
async function convertToPostmanCollection(openApiSpec) {
  return new Promise((resolve, reject) => {
    convert({
      type: 'json',
      data: openApiSpec
    }, {
      requestParametersResolution: 'Example',
      exampleParametersResolution: 'Example',
      folderStrategy: 'Tags',
      requestNameSource: 'Fallback',
      indentCharacter: ' '
    }, (error, conversionResult) => {
      if (error) {
        console.log('❌ Conversion error:', error);
        reject(error);
      } else {
        console.log('✅ Conversion successful');
        console.log('📊 Result status:', conversionResult?.result);
        resolve(conversionResult);
      }
    });
  });
}

// ✅ NEW: Safe collection saving
async function saveCollections(collections) {
  const savedFiles = [];
  
  for (const [key, collection] of Object.entries(collections)) {
    const filename = `${key}-apis.json`;
    const filePath = path.join(POSTMAN_PATH, filename);

    try {
      await fs.writeFile(filePath, JSON.stringify(collection, null, 2));
      console.log(`💾 Saved: ${filename} (${collection.item.length} items)`);
      savedFiles.push(filename);
    } catch (saveError) {
      console.warn(`⚠️ Could not save ${filename}:`, saveError.message);
      if (isServerless) {
        console.log(`ℹ️ Collection ${key} generated in memory only`);
        savedFiles.push(`${filename} (memory-only)`);
      } else {
        throw saveError;
      }
    }
  }
  
  return savedFiles;
}

function processRequestItem(item, collections) {
  if (item.item && Array.isArray(item.item)) {
    console.log(`📁 Processing folder: ${item.name}`);
    const folderCategory = categorizeFolderByName(item.name);

    item.item.forEach((subItem, subIndex) => {
      console.log(`  📄 Processing sub-item ${subIndex + 1}: ${subItem.name || 'Unnamed'}`);

      if (subItem.request) {
        console.log(`  🔗 Processing request: ${subItem.name}`);
        const collectionType = folderCategory;
        console.log(`  📂 Categorized as: ${collectionType} (from folder: ${item.name})`);

        if (collections[collectionType]) {
          if (collectionType !== 'platform') {
            addTenantHeader(subItem);
          }
          updateUrlVariables(subItem);
          collections[collectionType].item.push(subItem);
        }
      }
    });
  }
  else if (item.request) {
    console.log(`  🔗 Processing request: ${item.name}`);
    const collectionType = categorizeRequest(item);
    console.log(`  📂 Categorized as: ${collectionType}`);

    if (collections[collectionType]) {
      if (collectionType !== 'platform') {
        addTenantHeader(item);
      }
      updateUrlVariables(item);
      collections[collectionType].item.push(item);
    }
  } else {
    console.log(`  ⚠️ Skipping item (no request object): ${item.name || 'Unnamed'}`);
  }
}

function categorizeFolderByName(folderName) {
  const name = folderName.toLowerCase();

  if (name.includes('platform')) {
    return 'platform';
  } else if (name.includes('product') || name.includes('academic') ||
    name.includes('finance') || name.includes('library')) {
    return 'product';
  } else {
    return 'school';
  }
}

function createBaseCollection(name, description) {
  return {
    info: {
      name,
      description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{bearerToken}}', type: 'string' }]
    },
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: [
            '// Auto-generate timestamp',
            'pm.globals.set("timestamp", new Date().toISOString());',
            '',
            '// Check if bearer token exists',
            'if (!pm.collectionVariables.get("bearerToken")) {',
            '    console.log("⚠️ Bearer token not set. Please update the bearerToken variable.");',
            '}',
            '',
            '// Add request logging',
            'console.log("Making request to:", pm.request.url.toString());'
          ]
        }
      },
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            '// Basic response validation',
            'pm.test("Status code is success", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201, 202, 204]);',
            '});',
            '',
            '// Response time check',
            'pm.test("Response time is less than 3000ms", function () {',
            '    pm.expect(pm.response.responseTime).to.be.below(3000);',
            '});'
          ]
        }
      }
    ],
    variable: [
      { key: 'baseUrl', value: 'https://school-saas-ten.vercel.app', type: 'string' },
      { key: 'localUrl', value: 'http://localhost:3000', type: 'string' },
      { key: 'bearerToken', value: 'your-jwt-token-here', type: 'string' },
      { key: 'tenantId', value: 'school_demo_123', type: 'string' },
      { key: 'adminEmail', value: 'admin@demo.com', type: 'string' }
    ],
    item: []
  };
}

function categorizeRequest(item) {
  const url = item.request?.url?.raw || '';
  const name = item.name || '';
  const folderName = item.parent?.name || '';

  console.log(`🔍 Categorizing: ${name} | URL: ${url} | Folder: ${folderName}`);

  if (name.toLowerCase().includes('platform') ||
    folderName.toLowerCase().includes('platform') ||
    url.includes('/platform/')) {
    console.log(`📂 → platform`);
    return 'platform';
  }

  if (name.toLowerCase().includes('product') ||
    folderName.toLowerCase().includes('product') ||
    name.toLowerCase().includes('academic') ||
    name.toLowerCase().includes('finance') ||
    name.toLowerCase().includes('library') ||
    url.includes('/products/') ||
    url.includes('/academic/') ||
    url.includes('/finance/') ||
    url.includes('/library/')) {
    console.log(`📂 → product`);
    return 'product';
  }

  console.log(`📂 → school`);
  return 'school';
}

function addTenantHeader(item) {
  if (!item?.request) {
    console.warn(`⚠️ Missing request object for item: ${item?.name || 'unknown'}`);
    return;
  }

  if (!item.request.header) {
    item.request.header = [];
  }

  if (!Array.isArray(item.request.header)) {
    console.warn(`⚠️ Header is not an array for item: ${item.name}`);
    item.request.header = [];
  }

  const hasTenantHeader = item.request.header.some(
    header => header?.key?.toLowerCase() === 'x-tenant-id'
  );

  if (!hasTenantHeader) {
    item.request.header.push({
      key: 'X-Tenant-ID',
      value: '{{tenantId}}',
      type: 'text',
      description: 'Tenant identifier for multi-tenancy'
    });
    console.log(`  ✅ Added tenant header to: ${item.name}`);
  } else {
    console.log(`  ℹ️ Tenant header already exists for: ${item.name}`);
  }
}

function updateUrlVariables(item) {
  if (!item?.request?.url) {
    return;
  }

  if (typeof item.request.url === 'string') {
    item.request.url = item.request.url
      .replace('https://school-saas-ten.vercel.app', '{{baseUrl}}')
      .replace('http://localhost:3000', '{{localUrl}}');
  }
  else if (typeof item.request.url === 'object') {
    if (item.request.url.raw) {
      item.request.url.raw = item.request.url.raw
        .replace('https://school-saas-ten.vercel.app', '{{baseUrl}}')
        .replace('http://localhost:3000', '{{localUrl}}');
    }

    if (item.request.url.host) {
      item.request.url.host = ['{{baseUrl}}'];
    }
  }

  if (!item.request.description) {
    item.request.description = `Generated from OpenAPI spec

**Environment Variables:**
- baseUrl: {{baseUrl}}
- tenantId: {{tenantId}} 
- bearerToken: {{bearerToken}}

**Usage:**
1. Set your bearer token in the collection variables
2. Update tenantId with your school's tenant ID  
3. Execute the request`;
  }
}

// ✅ FIXED: Only run if not imported as module
if (import.meta.url === `file://${process.argv[1]}`) {
  generatePostmanCollections();
}

// ✅ Export for use in other files
export { generatePostmanCollections };
