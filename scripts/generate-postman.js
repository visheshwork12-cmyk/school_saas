// scripts/generate-postman.js - FIXED VERSION
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
  console.log('🚀 Starting Postman collection generation...');
  console.log('📂 Project root:', process.cwd());
  console.log('📂 Docs path:', DOCS_PATH);
  console.log('📂 Postman output path:', POSTMAN_PATH);

  try {
    // Check if docs directory exists
    try {
      await fs.access(DOCS_PATH);
      console.log('✅ docs/ directory exists');
    } catch (error) {
      console.log('❌ docs/ directory does not exist, creating...');
      try {
        await fs.mkdir(DOCS_PATH, { recursive: true });
      } catch (err) {
        if (err.code !== 'EEXIST') {
          console.warn('Could not create docs directory:', DOCS_PATH, err);
        }
      }
    }

    // Check if OpenAPI spec exists
    const openApiPath = path.join(DOCS_PATH, 'api/openapi.yaml');
    console.log('🔍 Looking for OpenAPI spec at:', openApiPath);

    let openApiSpec;
    try {
      const openApiContent = await fs.readFile(openApiPath, 'utf-8');
      openApiSpec = yaml.load(openApiContent);
      console.log('✅ OpenAPI spec loaded successfully');
      console.log('📊 Spec info:', openApiSpec.info?.title || 'No title');
    } catch (error) {
      console.log('❌ OpenAPI spec not found, creating minimal spec...');

      // Create minimal OpenAPI spec
      openApiSpec = {
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

      // Save the minimal spec
      await fs.mkdir(path.dirname(openApiPath), { recursive: true });
      await fs.writeFile(openApiPath, yaml.dump(openApiSpec));
      console.log('✅ Minimal OpenAPI spec created at:', openApiPath);
    }

    console.log('📝 Converting OpenAPI to Postman collections...');

    // Convert to Postman collection
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
          console.log('❌ Conversion error:', error);
          reject(error);
        } else {
          console.log('✅ Conversion successful');
          console.log('📊 Result status:', conversionResult?.result);
          resolve(conversionResult);
        }
      });
    });

    if (!result?.result || !result?.output?.[0]?.data) {
      throw new Error('No collection data generated from OpenAPI spec');
    }

    const collection = result.output[0].data;
    console.log('📦 Generated collection items:', collection.item?.length || 0);

    // Create postman directory
    await fs.mkdir(POSTMAN_PATH, { recursive: true });
    console.log('📂 Postman directory created/verified');

    // Initialize collections
    const collections = {
      platform: createBaseCollection('Platform APIs - School ERP', 'Platform-level APIs'),
      school: createBaseCollection('School APIs - School ERP', 'School-specific APIs'),
      product: createBaseCollection('Product APIs - School ERP', 'Product feature APIs')
    };

    console.log('📋 Processing collection items...');

    // Process requests with improved error handling
    if (collection.item && Array.isArray(collection.item)) {
      collection.item.forEach((item, index) => {
        console.log(`📄 Processing item ${index + 1}: ${item.name || 'Unnamed'}`);
        processRequestItem(item, collections);
      });
    }

    console.log('💾 Saving Postman collections...');

    // Save collections
    const savedFiles = [];
    for (const [key, collection] of Object.entries(collections)) {
      const filename = `${key}-apis.json`;
      const filePath = path.join(POSTMAN_PATH, filename);

      await fs.writeFile(filePath, JSON.stringify(collection, null, 2));
      console.log(`💾 Saved: ${filename} (${collection.item.length} items)`);
      savedFiles.push(filename);
    }

    console.log('✅ Postman collections generated successfully!');
    console.log(`📁 Platform APIs: ${collections.platform.item.length} requests`);
    console.log(`📁 School APIs: ${collections.school.item.length} requests`);
    console.log(`📁 Product APIs: ${collections.product.item.length} requests`);
    console.log(`📂 Files saved to: ${POSTMAN_PATH}`);
    console.log('🔗 Saved files:', savedFiles);

    return savedFiles;

  } catch (error) {
    console.error('❌ Error generating Postman collections:', error.message);
    console.error('📄 Stack trace:', error.stack);
    process.exit(1);
  }
}

function processRequestItem(item, collections) {
  // Check if this is a folder (has child items)
  if (item.item && Array.isArray(item.item)) {
    console.log(`📁 Processing folder: ${item.name}`);

    // ✅ IMPROVED: Determine folder category based on folder name
    const folderCategory = categorizeFolderByName(item.name);

    // Process each request in the folder
    item.item.forEach((subItem, subIndex) => {
      console.log(`  📄 Processing sub-item ${subIndex + 1}: ${subItem.name || 'Unnamed'}`);

      if (subItem.request) {
        console.log(`  🔗 Processing request: ${subItem.name}`);

        // ✅ Use folder category instead of individual request categorization
        const collectionType = folderCategory;
        console.log(`  📂 Categorized as: ${collectionType} (from folder: ${item.name})`);

        if (collections[collectionType]) {
          // Add tenant header for school and product APIs
          if (collectionType !== 'platform') {
            addTenantHeader(subItem);
          }

          // Update URLs to use variables
          updateUrlVariables(subItem);

          // Add to appropriate collection
          collections[collectionType].item.push(subItem);
        }
      }
    });
  }
  // This is a direct request
  else if (item.request) {
    console.log(`  🔗 Processing request: ${item.name}`);

    const collectionType = categorizeRequest(item);
    console.log(`  📂 Categorized as: ${collectionType}`);

    if (collections[collectionType]) {
      // Add tenant header for school and product APIs
      if (collectionType !== 'platform') {
        addTenantHeader(item);
      }

      // Update URLs to use variables
      updateUrlVariables(item);

      // Add to appropriate collection
      collections[collectionType].item.push(item);
    }
  } else {
    console.log(`  ⚠️ Skipping item (no request object): ${item.name || 'Unnamed'}`);
  }
}

// New function to categorize by folder name
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
  const folderName = item.parent?.name || ''; // Get parent folder name

  console.log(`🔍 Categorizing: ${name} | URL: ${url} | Folder: ${folderName}`);

  // Check by folder/tag names first (most reliable)
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

  // Default to school for everything else
  console.log(`📂 → school`);
  return 'school';
}


// ✅ FIXED: Defensive programming for undefined objects
function addTenantHeader(item) {
  // Check if item exists
  if (!item) {
    console.warn('⚠️ Item is undefined or null');
    return;
  }

  // Check if request exists
  if (!item.request) {
    console.warn(`⚠️ Missing request object for item: ${item.name || 'unknown'}`);
    return;
  }

  // Initialize header array if it doesn't exist
  if (!item.request.header) {
    item.request.header = [];
  }

  // Ensure header is an array
  if (!Array.isArray(item.request.header)) {
    console.warn(`⚠️ Header is not an array for item: ${item.name}`);
    item.request.header = [];
  }

  // Check if tenant header already exists (avoid duplicates)
  const hasTenantHeader = item.request.header.some(
    header => header && header.key && header.key.toLowerCase() === 'x-tenant-id'
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

// ✅ FIXED: Safe URL variable replacement
function updateUrlVariables(item) {
  if (!item || !item.request) {
    return;
  }

  if (item.request.url) {
    // Handle string URL
    if (typeof item.request.url === 'string') {
      item.request.url = item.request.url
        .replace('https://school-saas-ten.vercel.app', '{{baseUrl}}')
        .replace('http://localhost:3000', '{{localUrl}}');
    }
    // Handle object URL
    else if (typeof item.request.url === 'object') {
      if (item.request.url.raw) {
        item.request.url.raw = item.request.url.raw
          .replace('https://school-saas-ten.vercel.app', '{{baseUrl}}')
          .replace('http://localhost:3000', '{{localUrl}}');
      }

      // Update host array
      if (item.request.url.host) {
        item.request.url.host = ['{{baseUrl}}'];
      }
    }

    // Add description if missing
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

// Run the function
generatePostmanCollections();
