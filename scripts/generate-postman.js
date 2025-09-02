// scripts/generate-postman.js
import { convert } from 'openapi-to-postmanv2';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_PATH = path.join(__dirname, '../docs');
const POSTMAN_PATH = path.join(DOCS_PATH, 'api/postman');

async function generatePostmanCollections() {
  try {
    console.log('🔄 Reading OpenAPI specification...');
    
    // Read OpenAPI spec
    const openApiPath = path.join(DOCS_PATH, 'api/openapi.yaml');
    const openApiContent = await fs.readFile(openApiPath, 'utf-8');
    const openApiSpec = yaml.load(openApiContent);
    
    console.log('📝 Converting OpenAPI to Postman collections...');
    
    // Convert to Postman collection using correct API
    const result = await new Promise((resolve, reject) => {
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
          reject(error);
        } else {
          resolve(conversionResult);
        }
      });
    });
    
    if (!result || !result.result || !result.output || result.output.length === 0) {
      throw new Error('No collection generated from OpenAPI spec');
    }
    
    const collection = result.output[0].data;
    
    console.log('🔄 Organizing collections by tags...');
    
    // Initialize collections
    const collections = {
      platform: createBaseCollection('Platform APIs - School ERP', 'Platform-level APIs for organization and subscription management'),
      school: createBaseCollection('School APIs - School ERP', 'School-specific APIs for user, student, and class management'),
      product: createBaseCollection('Product APIs - School ERP', 'Feature-specific APIs for academic, finance, library modules')
    };
    
    // Process each request item
    if (collection.item && Array.isArray(collection.item)) {
      collection.item.forEach(item => {
        processRequestGroup(item, collections);
      });
    }
    
    console.log('💾 Saving Postman collections...');
    
    // Ensure postman directory exists
    await fs.mkdir(POSTMAN_PATH, { recursive: true });
    
    // Save collections
    await Promise.all([
      saveCollection('platform-apis.json', collections.platform),
      saveCollection('school-apis.json', collections.school),
      saveCollection('product-apis.json', collections.product)
    ]);
    
    console.log('✅ Postman collections generated successfully!');
    console.log(`📁 Platform APIs: ${collections.platform.item.length} requests`);
    console.log(`📁 School APIs: ${collections.school.item.length} requests`);
    console.log(`📁 Product APIs: ${collections.product.item.length} requests`);
    console.log(`📂 Files saved to: ${POSTMAN_PATH}`);
    
  } catch (error) {
    console.error('❌ Error generating Postman collections:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
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
      bearer: [
        {
          key: 'token',
          value: '{{bearerToken}}',
          type: 'string'
        }
      ]
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
            '});',
            '',
            '// Content-Type check',
            'pm.test("Content-Type is application/json", function () {',
            '    pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");',
            '});'
          ]
        }
      }
    ],
    variable: [
      {
        key: 'baseUrl',
        value: 'https://school-saas-ten.vercel.app',
        type: 'string'
      },
      {
        key: 'localUrl',
        value: 'http://localhost:3000',
        type: 'string'
      },
      {
        key: 'bearerToken',
        value: 'your-jwt-token-here',
        type: 'string'
      },
      {
        key: 'tenantId',
        value: 'school_demo_123',
        type: 'string'
      },
      {
        key: 'adminEmail',
        value: 'admin@demo.com',
        type: 'string'
      },
      {
        key: 'testStudentId',
        value: '{{$randomUUID}}',
        type: 'string'
      }
    ],
    item: []
  };
}

function processRequestGroup(item, collections) {
  if (item.item && Array.isArray(item.item)) {
    // This is a folder, process each request inside
    item.item.forEach(request => {
      const collectionType = categorizeRequest(request);
      if (collectionType && collections[collectionType]) {
        // Add tenant header for school and product APIs
        if (collectionType !== 'platform') {
          addTenantHeader(request);
        }
        
        // Update URLs to use variables
        updateUrlVariables(request);
        
        // Add to appropriate parent folder or create folder structure
        addToCollection(collections[collectionType], item.name, request);
      }
    });
  } else {
    // This is a direct request
    const collectionType = categorizeRequest(item);
    if (collectionType && collections[collectionType]) {
      if (collectionType !== 'platform') {
        addTenantHeader(item);
      }
      updateUrlVariables(item);
      collections[collectionType].item.push(item);
    }
  }
}

function addToCollection(collection, folderName, request) {
  // Find existing folder or create new one
  let folder = collection.item.find(item => item.name === folderName);
  
  if (!folder) {
    folder = {
      name: folderName,
      item: []
    };
    collection.item.push(folder);
  }
  
  folder.item.push(request);
}

function categorizeRequest(item) {
  const url = item.request?.url?.raw || '';
  const name = item.name || '';
  
  // Check URL patterns
  if (url.includes('/platform/') || name.toLowerCase().includes('platform')) {
    return 'platform';
  } else if (url.includes('/products/') || name.toLowerCase().includes('product') || 
             url.includes('/academic/') || url.includes('/finance/') || 
             url.includes('/library/') || url.includes('/transport/') || url.includes('/hr/')) {
    return 'product';
  } else if (url.includes('/schools/') || name.toLowerCase().includes('school') ||
             url.includes('/students') || url.includes('/classes') || url.includes('/users')) {
    return 'school';
  }
  
  // Default categorization based on tags or path
  if (item.request?.description) {
    const desc = item.request.description.toLowerCase();
    if (desc.includes('platform')) return 'platform';
    if (desc.includes('product') || desc.includes('academic') || desc.includes('finance')) return 'product';
    if (desc.includes('school') || desc.includes('student') || desc.includes('class')) return 'school';
  }
  
  return 'school'; // Default fallback
}

function addTenantHeader(item) {
  if (!item.request.header) {
    item.request.header = [];
  }
  
  // Check if tenant header already exists
  const hasTenantHeader = item.request.header.some(
    header => header.key === 'X-Tenant-ID'
  );
  
  if (!hasTenantHeader) {
    item.request.header.push({
      key: 'X-Tenant-ID',
      value: '{{tenantId}}',
      type: 'text',
      description: 'Tenant identifier for multi-tenancy'
    });
  }
}

function updateUrlVariables(item) {
  if (item.request && item.request.url) {
    // Update raw URL
    if (item.request.url.raw) {
      item.request.url.raw = item.request.url.raw
        .replace('https://school-saas-ten.vercel.app', '{{baseUrl}}')
        .replace('http://localhost:3000', '{{localUrl}}');
    }
    
    // Update host array
    if (item.request.url.host) {
      item.request.url.host = ['{{baseUrl}}'];
    }
    
    // Update URL object if it exists
    if (typeof item.request.url === 'object' && item.request.url.protocol) {
      item.request.url.host = ['{{baseUrl}}'];
      delete item.request.url.protocol;
      delete item.request.url.port;
    }
    
    // Add request description with example
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
}

async function saveCollection(filename, collection) {
  const filePath = path.join(POSTMAN_PATH, filename);
  await fs.writeFile(filePath, JSON.stringify(collection, null, 2));
  console.log(`💾 Saved: ${filename} (${collection.item.length} items)`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generatePostmanCollections();
}

export { generatePostmanCollections };
