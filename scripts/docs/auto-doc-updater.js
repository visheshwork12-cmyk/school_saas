// scripts/docs/auto-doc-updater.js
import fs from 'fs/promises';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import config from '#shared/config/index.js';

/**
 * @typedef {Object} SchemaInfo
 * @property {string} name - Schema name
 * @property {string} file - Relative file path
 * @property {Object} definition - Cleaned schema definition
 * @property {Object[]} indexes - Schema indexes
 * @property {string[]} relationships - Schema relationships
 * @property {string[]} virtuals - Virtual field names
 * @property {string[]} methods - Instance method names
 * @property {string[]} statics - Static method names
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {SchemaInfo[]} schemas - Valid schemas
 * @property {Object[]} errors - Extraction errors
 * @property {string} file - File path
 * @property {string} reason - Error reason
 * @property {string} [error] - Error name
 */

/**
 * @description Extracts schemas from Mongoose models
 */
class SchemaExtractor {
  /**
   * @description Recursively extracts all schemas from model files
   * @returns {Promise<ExtractionResult>}
   */
  async extractAllSchemas() {
    try {
      const modelDir = path.join(process.cwd(), 'src/domain/models');
      const files = await this.getModelFiles(modelDir);
      
      const schemas = [];
      const errors = [];
      
      for (const file of files) {
        try {
          // Try to import the model
          const module = await import(path.resolve(file));
          const Model = module.default;

          // Validate model structure
          if (!this.isValidMongooseModel(Model)) {
            errors.push({
              file: file.replace(process.cwd(), ''),
              reason: 'Not a valid Mongoose model - missing schema or modelName'
            });
            continue;
          }

          // Extract schema info
          const schemaInfo = this.extractSchemaInfo(Model, file);
          schemas.push(schemaInfo);
          
        } catch (importError) {
          errors.push({
            file: file.replace(process.cwd(), ''),
            reason: importError.message,
            error: importError.name
          });
          logger.error(`Failed to load model ${file}: ${importError.message}`, { file, error: importError });
        }
      }

      // Log results
      logger.info(`Schema extraction completed`, {
        totalFiles: files.length,
        validSchemas: schemas.length,
        errors: errors.length
      });

      if (errors.length > 0) {
        logger.warn('Model file errors found:', { errors });
      }

      return { schemas, errors };
      
    } catch (error) {
      logger.error(`Schema extraction failed: ${error.message}`, { error });
      throw new Error(`Schema extraction failed: ${error.message}`);
    }
  }

  /**
   * @description Validates if the model is a valid Mongoose model
   * @param {any} Model - Potential Mongoose model
   * @returns {boolean}
   */
  isValidMongooseModel(Model) {
    return (
      Model && 
      typeof Model === 'function' &&
      Model.schema && 
      typeof Model.modelName === 'string' &&
      typeof Model.schema.obj === 'object'
    );
  }

  /**
   * @description Extracts detailed schema information
   * @param {mongoose.Model} Model - Mongoose model
   * @param {string} filePath - Full file path
   * @returns {SchemaInfo}
   */
  extractSchemaInfo(Model, filePath) {
    return {
      name: Model.modelName,
      file: filePath.replace(process.cwd(), ''),
      definition: this.cleanSchemaDefinition(Model.schema.obj),
      indexes: Model.schema.indexes(),
      relationships: this.extractRelationships(Model.schema),
      virtuals: Object.keys(Model.schema.virtuals || {}),
      methods: Object.keys(Model.schema.methods || {}),
      statics: Object.keys(Model.schema.statics || {})
    };
  }

  /**
   * @description Cleans schema definition for JSON serialization
   * @param {Object} obj - Schema object
   * @returns {Object}
   */
  cleanSchemaDefinition(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      if (typeof value === 'function') return '[Function]';
      if (value && typeof value === 'object' && value.constructor && value.constructor.name) {
        if (value.constructor.name === 'ObjectId') return '[ObjectId]';
        if (value.constructor.name === 'SchemaType') return '[SchemaType]';
      }
      return value;
    }));
  }

  /**
   * @description Extracts relationships from schema
   * @param {mongoose.Schema} schema - Mongoose schema
   * @returns {string[]}
   */
  extractRelationships(schema) {
    const relationships = [];
    
    const extractFromObj = (obj, prefix = '') => {
      for (const [field, def] of Object.entries(obj || {})) {
        const fieldPath = prefix ? `${prefix}.${field}` : field;
        
        if (def && typeof def === 'object') {
          // Direct reference
          if (def.ref) {
            relationships.push(`${schema.modelName}.${fieldPath} -> ${def.ref}`);
          }
          
          // Array reference
          if (Array.isArray(def) && def[0] && def[0].ref) {
            relationships.push(`${schema.modelName}.${fieldPath} -> ${def[0].ref}[]`);
          }
          
          // Nested object
          if (!def.type && !def.ref && typeof def === 'object') {
            extractFromObj(def, fieldPath);
          }
        }
      }
    };
    
    extractFromObj(schema.obj);
    return relationships;
  }

  /**
   * @description Recursively retrieves all .model.js files
   * @param {string} dir - Directory to scan
   * @returns {Promise<string[]>}
   */
  async getModelFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.getModelFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.model.js')) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

/**
 * @description Updates documentation automatically
 */
export class AutoDocUpdater {
  /**
   * @description Updates database schema documentation
   * @returns {Promise<{ success: boolean, schemasFound: number, errors: number }>}
   */
  async updateDatabaseSchema() {
    try {
      const schemaExtractor = new SchemaExtractor();
      const { schemas, errors } = await schemaExtractor.extractAllSchemas();

      let markdown = `# Database Schema (Auto-generated)
Generated: ${new Date().toISOString()}
⚠️ This is auto-generated. Manual changes will be overwritten.

## Summary
- **Total Models Found**: ${schemas.length}
- **Errors**: ${errors.length}
- **Last Updated**: ${new Date().toLocaleString()}

`;

      if (errors.length > 0) {
        markdown += `## ⚠️ Errors Found\n\n`;
        errors.forEach(error => {
          markdown += `- **${error.file}**: ${error.reason}\n`;
        });
        markdown += '\n---\n\n';
      }

      if (schemas.length === 0) {
        markdown += `## ❌ No Valid Models Found

### Common Issues:
1. **Missing default export**: Ensure your model files export the Mongoose model as default
2. **Invalid model structure**: Check that models are created with \`mongoose.model()\`
3. **Import errors**: Verify all imports are working correctly

### Example of correct model structure:
\`\`\`javascript
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true }
});

const User = mongoose.model('User', userSchema);
export default User;
\`\`\`

`;
      } else {
        schemas.forEach(schema => {
          markdown += this.generateSchemaMarkdown(schema);
        });
      }

      const filePath = path.join(config.paths?.docs || 'docs', 'architecture', 'database-schema-generated.md');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, markdown);
      
      logger.info('Database schema documentation updated', { 
        file: filePath,
        schemaCount: schemas.length,
        errorCount: errors.length
      });

      await AuditService.log('DOC_SCHEMA_UPDATE', {
        action: 'update_database_schema',
        file: filePath,
        schemaCount: schemas.length,
        errorCount: errors.length,
      });

      return { success: true, schemasFound: schemas.length, errors: errors.length };
      
    } catch (error) {
      logger.error(`Database schema update failed: ${error.message}`, { error });
      throw new Error(`Database schema update failed: ${error.message}`);
    }
  }

  /**
   * @description Generates Markdown for a schema
   * @param {SchemaInfo} schema - Schema information
   * @returns {string}
   */
  generateSchemaMarkdown(schema) {
    return `
## ${schema.name} Collection

**File**: \`${schema.file}\`

### Schema Definition
\`\`\`javascript
${JSON.stringify(schema.definition, null, 2)}
\`\`\`

### Indexes
${schema.indexes.length ? 
  schema.indexes.map(index => `- \`${JSON.stringify(index)}\``).join('\n') : 
  '- None defined'
}

### Relationships
${schema.relationships.length ? 
  schema.relationships.map(rel => `- ${rel}`).join('\n') : 
  '- No relationships found'
}

${schema.virtuals.length ? `### Virtual Fields\n${schema.virtuals.map(v => `- ${v}`).join('\n')}\n` : ''}

${schema.methods.length ? `### Instance Methods\n${schema.methods.map(m => `- ${m}()`).join('\n')}\n` : ''}

${schema.statics.length ? `### Static Methods\n${schema.statics.map(s => `- ${s}()`).join('\n')}\n` : ''}

---
`;
  }

  /**
   * @description Updates API documentation from Swagger comments
   * @returns {Promise<{ success: boolean }>}
   */
  async updateApiDocumentation() {
    try {
      const options = {
        definition: {
          openapi: '3.0.0',
          info: { title: 'School ERP API', version: '1.0.0' },
        },
        apis: ['./src/api/v1/**/*.js'],
      };

      const specs = swaggerJsdoc(options);
      const markdown = this.openApiToMarkdown(specs);

      const filePath = path.join(config.paths?.docs || 'docs', 'api', 'api-reference-generated.md');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, markdown);
      
      logger.info('API documentation updated', { file: filePath });

      await AuditService.log('DOC_API_UPDATE', {
        action: 'update_api_documentation',
        file: filePath,
      });

      return { success: true };
      
    } catch (error) {
      logger.error(`API documentation update failed: ${error.message}`, { error });
      throw new Error(`API documentation update failed: ${error.message}`);
    }
  }

  /**
   * @description Converts OpenAPI spec to Markdown
   * @param {Object} specs - OpenAPI specification
   * @returns {string}
   */
  openApiToMarkdown(specs) {
    let markdown = `# API Reference (Auto-generated)
Generated: ${new Date().toISOString()}
⚠️ This is auto-generated. Manual changes will be overwritten.

`;

    if (!specs.paths || Object.keys(specs.paths).length === 0) {
      markdown += `## No API Endpoints Found

This might be because:
1. No Swagger comments found in your API files
2. API files are not in the expected location (\`./src/api/v1/**/*.js\`)
3. Swagger comments are not properly formatted

### Example Swagger Comment:
\`\`\`javascript
/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Success
 */
\`\`\`
`;
      return markdown;
    }

    for (const [path, methods] of Object.entries(specs.paths)) {
      markdown += `## ${path}\n`;
      for (const [method, details] of Object.entries(methods)) {
        markdown += `### ${method.toUpperCase()}
- **Summary**: ${details.summary || 'No summary'}  
- **Description**: ${details.description || 'No description'}
- **Tags**: ${details.tags ? details.tags.join(', ') : 'None'}

`;
        if (details.parameters && details.parameters.length > 0) {
          markdown += `**Parameters:**\n`;
          details.parameters.forEach(param => {
            markdown += `- \`${param.name}\` (${param.in}): ${param.description || 'No description'}\n`;
          });
        }
        
        markdown += '\n';
      }
      markdown += '---\n';
    }

    return markdown;
  }
}

// Usage
(async () => {
  try {
    const updater = new AutoDocUpdater();
    
    console.log('🔄 Updating database schema documentation...');
    const schemaResult = await updater.updateDatabaseSchema();
    console.log(`✅ Schema update complete: ${schemaResult.schemasFound} models found, ${schemaResult.errors} errors`);
    
    console.log('🔄 Updating API documentation...');
    await updater.updateApiDocumentation();
    console.log('✅ API documentation update complete');
    
  } catch (error) {
    console.error(`❌ Documentation update failed: ${error.message}`);
    process.exit(1);
  }
})();