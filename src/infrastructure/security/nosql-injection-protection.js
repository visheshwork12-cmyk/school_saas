// src/infrastructure/security/nosql-injection-protection.js
import { logger } from "#utils/core/logger.js";
import { ValidationException } from "#shared/exceptions/validation.exception.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";

/**
 * NoSQL Injection Protection Service
 * Specialized protection for MongoDB injection attacks
 */
export class NoSQLInjectionProtection {
  
  // Dangerous MongoDB operators and patterns
  static DANGEROUS_OPERATORS = [
    '$where', '$regex', '$text', '$mod', '$exists', '$type',
    '$elemMatch', '$size', '$all', '$near', '$nearSphere'
  ];

  static JAVASCRIPT_PATTERNS = [
    /function\s*\(/i,
    /=>\s*{/,
    /eval\s*\(/i,
    /setTimeout|setInterval/i,
    /process\.|require\(/i,
    /global\.|this\./i,
    /constructor/i,
    /__proto__/i
  ];

  /**
   * Validates MongoDB query object for injection attempts
   * @param {Object} query - MongoDB query object
   * @param {string} tenantId - Tenant ID
   * @returns {Object} - Sanitized query
   */
  static async validateMongoQuery(query, tenantId = 'default') {
    try {
      if (!query || typeof query !== 'object') {
        return query;
      }

      const sanitized = await this.sanitizeQueryObject(query, tenantId);
      return sanitized;
    } catch (error) {
      logger.error("MongoDB query validation failed", error);
      throw new ValidationException("Invalid query structure", "NOSQL_INJECTION_DETECTED");
    }
  }

  /**
   * Recursively sanitizes query object
   * @param {Object} obj - Object to sanitize
   * @param {string} tenantId - Tenant ID
   * @param {string} path - Current path for logging
   * @returns {Object} - Sanitized object
   */
  static async sanitizeQueryObject(obj, tenantId, path = '') {
    if (obj === null || typeof obj !== 'object') {
      return this.sanitizeValue(obj, tenantId, path);
    }

    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map((item, index) => 
          this.sanitizeQueryObject(item, tenantId, `${path}[${index}]`)
        )
      );
    }

    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check for dangerous operators
      if (this.isDangerousOperator(key)) {
        await AuditService.log("NOSQL_INJECTION_ATTEMPT", {
          operator: key,
          path: currentPath,
          value: JSON.stringify(value).substring(0, 100),
          tenantId,
          severity: "HIGH"
        });

        logger.security("Dangerous MongoDB operator detected", {
          operator: key,
          path: currentPath,
          tenantId
        });

        // Skip dangerous operators
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof value === 'object') {
        sanitized[key] = await this.sanitizeQueryObject(value, tenantId, currentPath);
      } else {
        sanitized[key] = this.sanitizeValue(value, tenantId, currentPath);
      }
    }

    return sanitized;
  }

  /**
   * Checks if operator is dangerous
   * @param {string} operator - MongoDB operator
   * @returns {boolean} - True if dangerous
   */
  static isDangerousOperator(operator) {
    return this.DANGEROUS_OPERATORS.includes(operator) ||
           operator.startsWith('$') && this.containsJavaScript(operator);
  }

  /**
   * Sanitizes individual values
   * @param {*} value - Value to sanitize
   * @param {string} tenantId - Tenant ID
   * @param {string} path - Field path
   * @returns {*} - Sanitized value
   */
  static sanitizeValue(value, tenantId, path) {
    if (typeof value === 'string') {
      // Check for JavaScript patterns
      if (this.containsJavaScript(value)) {
        logger.security("JavaScript pattern in NoSQL query", {
          value: value.substring(0, 50),
          path,
          tenantId
        });
        
        // Remove JavaScript patterns
        return this.removeJavaScriptPatterns(value);
      }
    }
    
    return value;
  }

  /**
   * Checks for JavaScript patterns in strings
   * @param {string} input - Input to check
   * @returns {boolean} - True if contains JavaScript
   */
  static containsJavaScript(input) {
    if (typeof input !== 'string') return false;
    
    return this.JAVASCRIPT_PATTERNS.some(pattern => pattern.test(input));
  }

  /**
   * Removes JavaScript patterns from strings
   * @param {string} input - Input to clean
   * @returns {string} - Cleaned input
   */
  static removeJavaScriptPatterns(input) {
    let cleaned = input;
    
    for (const pattern of this.JAVASCRIPT_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    return cleaned.trim();
  }

  /**
   * Validates MongoDB aggregation pipeline
   * @param {Array} pipeline - Aggregation pipeline
   * @param {string} tenantId - Tenant ID
   * @returns {Array} - Sanitized pipeline
   */
  static async validateAggregationPipeline(pipeline, tenantId = 'default') {
    if (!Array.isArray(pipeline)) {
      throw new ValidationException("Pipeline must be an array", "INVALID_PIPELINE");
    }

    const sanitized = [];
    
    for (const [index, stage] of pipeline.entries()) {
      // Validate each stage
      const sanitizedStage = await this.sanitizeQueryObject(stage, tenantId, `stage[${index}]`);
      sanitized.push(sanitizedStage);
    }

    return sanitized;
  }
}

// Mongoose middleware for NoSQL injection protection
export const mongooseSanitizeMiddleware = function(next) {
  const query = this.getQuery();
  const tenantId = this.options.tenantId || 'default';
  
  NoSQLInjectionProtection.validateMongoQuery(query, tenantId)
    .then(sanitizedQuery => {
      this.setQuery(sanitizedQuery);
      next();
    })
    .catch(next);
};

// Express middleware for request sanitization
export const noSQLInjectionMiddleware = () => {
  return async (req, res, next) => {
    try {
      const tenantId = req.context?.tenantId || 'default';
      
      // Sanitize query parameters
      if (req.query) {
        req.query = await NoSQLInjectionProtection.validateMongoQuery(req.query, tenantId);
      }
      
      // Sanitize request body
      if (req.body) {
        req.body = await NoSQLInjectionProtection.validateMongoQuery(req.body, tenantId);
      }
      
      next();
    } catch (error) {
      logger.error("NoSQL injection middleware error", error);
      next(error);
    }
  };
};
