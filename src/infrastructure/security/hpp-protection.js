// src/infrastructure/security/hpp-protection.js
import { logger } from "#utils/core/logger.js";
import { ValidationException } from "#shared/exceptions/validation.exception.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";

/**
 * HTTP Parameter Pollution (HPP) Protection Service
 * Prevents parameter pollution attacks
 */
export class HPPProtection {
  
  // Parameters that should remain as arrays
  static ARRAY_PARAMETERS = [
    'ids', 'tags', 'categories', 'permissions', 'roles',
    'files', 'attachments', 'recipients', 'items'
  ];

  // Parameters that should never be arrays
  static SINGLE_PARAMETERS = [
    'id', 'email', 'password', 'token', 'page', 'limit',
    'sort', 'order', 'tenantId', 'userId', 'schoolId'
  ];

  // Maximum allowed duplicate parameters
  static MAX_DUPLICATES = {
    default: 10,
    'tags': 50,
    'permissions': 100,
    'ids': 1000
  };

  /**
   * Protects against HTTP Parameter Pollution
   * @param {Object} params - Parameters object (query, body, etc.)
   * @param {Object} options - Protection options
   * @param {string} tenantId - Tenant ID
   * @returns {Object} - Sanitized parameters
   */
  static async protectParameters(params, options = {}, tenantId = 'default') {
    try {
      if (!params || typeof params !== 'object') {
        return params;
      }

      const protected = {};
      const violations = [];

      for (const [key, value] of Object.entries(params)) {
        const result = await this.processParameter(key, value, options, tenantId);
        
        if (result.violation) {
          violations.push(result.violation);
        }
        
        protected[key] = result.value;
      }

      // Log violations if any
      if (violations.length > 0) {
        await AuditService.log("HPP_VIOLATION", {
          violations,
          parameterCount: Object.keys(params).length,
          tenantId,
          severity: "MEDIUM"
        });

        logger.security("HTTP Parameter Pollution detected", {
          violations,
          tenantId
        });

        // Decide whether to block or allow with sanitization
        if (options.strict && violations.some(v => v.severity === 'HIGH')) {
          throw new ValidationException(
            "HTTP Parameter Pollution detected",
            "HPP_DETECTED"
          );
        }
      }

      return protected;
    } catch (error) {
      logger.error("HPP protection error", error);
      throw error;
    }
  }

  /**
   * Processes individual parameter for HPP
   * @param {string} key - Parameter key
   * @param {*} value - Parameter value
   * @param {Object} options - Options
   * @param {string} tenantId - Tenant ID
   * @returns {Object} - Processing result
   */
  static async processParameter(key, value, options, tenantId) {
    const result = {
      value,
      violation: null
    };

    // Handle arrays
    if (Array.isArray(value)) {
      return this.processArrayParameter(key, value, options);
    }

    // Handle objects (nested parameters)
    if (value && typeof value === 'object') {
      result.value = await this.protectParameters(value, options, tenantId);
      return result;
    }

    // Single value - check if it should be single
    if (this.SINGLE_PARAMETERS.includes(key.toLowerCase())) {
      // Parameter should be single, it's already single - good
      return result;
    }

    return result;
  }

  /**
   * Processes array parameters
   * @param {string} key - Parameter key
   * @param {Array} values - Parameter values array
   * @param {Object} options - Options
   * @returns {Object} - Processing result
   */
  static processArrayParameter(key, values, options) {
    const result = {
      value: values,
      violation: null
    };

    const maxDuplicates = this.MAX_DUPLICATES[key] || this.MAX_DUPLICATES.default;

    // Check if parameter should be single but received as array
    if (this.SINGLE_PARAMETERS.includes(key.toLowerCase())) {
      result.violation = {
        type: 'ARRAY_FOR_SINGLE_PARAM',
        parameter: key,
        expected: 'single',
        received: 'array',
        count: values.length,
        severity: 'HIGH'
      };

      // Take only the first value for single parameters
      result.value = values[0];
      return result;
    }

    // Check for excessive duplicates
    if (values.length > maxDuplicates) {
      result.violation = {
        type: 'EXCESSIVE_DUPLICATES',
        parameter: key,
        count: values.length,
        limit: maxDuplicates,
        severity: 'MEDIUM'
      };

      // Limit to maximum allowed
      result.value = values.slice(0, maxDuplicates);
    }

    // Check for suspicious patterns in array values
    const suspiciousCount = values.filter(v => 
      this.isSuspiciousValue(String(v))
    ).length;

    if (suspiciousCount > values.length * 0.5) { // More than 50% suspicious
      result.violation = {
        type: 'SUSPICIOUS_ARRAY_VALUES',
        parameter: key,
        suspiciousCount,
        totalCount: values.length,
        severity: 'HIGH'
      };
    }

    return result;
  }

  /**
   * Checks if a value looks suspicious
   * @param {string} value - Value to check
   * @returns {boolean} - True if suspicious
   */
  static isSuspiciousValue(value) {
    const suspiciousPatterns = [
      // Script injection patterns
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      
      // SQL injection patterns
      /union\s+select/i,
      /or\s+1\s*=\s*1/i,
      
      // Command injection patterns
      /[;&|`$()]/,
      
      // Path traversal
      /\.\.(\/|\\)/,
      
      // Extremely long values (potential buffer overflow)
      /.{1000,}/
    ];

    return suspiciousPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Normalizes URL-encoded parameter arrays
   * @param {Object} rawParams - Raw parsed parameters
   * @returns {Object} - Normalized parameters
   */
  static normalizeParameterArrays(rawParams) {
    const normalized = {};

    for (const [key, value] of Object.entries(rawParams)) {
      // Handle array notation like param[0], param[1], etc.
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
      
      if (arrayMatch) {
        const [, baseKey, index] = arrayMatch;
        
        if (!normalized[baseKey]) {
          normalized[baseKey] = [];
        }
        
        normalized[baseKey][parseInt(index)] = value;
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Validates parameter names for suspicious patterns
   * @param {Object} params - Parameters to validate
   * @returns {Array} - Array of suspicious parameter names
   */
  static validateParameterNames(params) {
    const suspicious = [];
    
    const suspiciousPatterns = [
      /^__/, // Double underscore (often system parameters)
      /^constructor$/i,
      /^prototype$/i,
      /^__proto__$/i,
      /eval|function|script/i,
      /\.\./,  // Path traversal in parameter names
      /[<>&"']/  // HTML/script characters in parameter names
    ];

    for (const key of Object.keys(params)) {
      if (suspiciousPatterns.some(pattern => pattern.test(key))) {
        suspicious.push(key);
      }
    }

    return suspicious;
  }
}

// Express middleware for HPP protection
export const hppProtectionMiddleware = (options = {}) => {
  const defaultOptions = {
    strict: false, // Set to true to block instead of sanitize
    whitelist: [], // Parameter names to allow as arrays
    maxKeys: 1000, // Maximum number of parameters
    ...options
  };

  return async (req, res, next) => {
    try {
      const tenantId = req.context?.tenantId || 'default';

      // Check total parameter count
      const totalParams = Object.keys(req.query).length + 
                         Object.keys(req.body || {}).length + 
                         Object.keys(req.params).length;

      if (totalParams > defaultOptions.maxKeys) {
        await AuditService.log("HPP_EXCESSIVE_PARAMETERS", {
          count: totalParams,
          limit: defaultOptions.maxKeys,
          tenantId
        });

        throw new ValidationException(
          `Too many parameters: ${totalParams} (limit: ${defaultOptions.maxKeys})`,
          "EXCESSIVE_PARAMETERS"
        );
      }

      // Validate parameter names
      const allParams = { ...req.query, ...req.body, ...req.params };
      const suspiciousNames = HPPProtection.validateParameterNames(allParams);
      
      if (suspiciousNames.length > 0) {
        await AuditService.log("HPP_SUSPICIOUS_PARAMETER_NAMES", {
          suspiciousNames,
          tenantId
        });

        if (defaultOptions.strict) {
          throw new ValidationException(
            `Suspicious parameter names: ${suspiciousNames.join(', ')}`,
            "SUSPICIOUS_PARAMETER_NAMES"
          );
        }
      }

      // Process and protect parameters
      if (Object.keys(req.query).length > 0) {
        req.query = await HPPProtection.protectParameters(
          req.query, 
          defaultOptions, 
          tenantId
        );
      }

      if (req.body && Object.keys(req.body).length > 0) {
        req.body = await HPPProtection.protectParameters(
          req.body, 
          defaultOptions, 
          tenantId
        );
      }

      next();
    } catch (error) {
      logger.error("HPP protection middleware error", error);
      next(error);
    }
  };
};

// Raw body parser with HPP protection
export const createHppProtectedBodyParser = () => {
  const qs = require('querystring');
  
  return (req, res, next) => {
    if (req.get('content-type') === 'application/x-www-form-urlencoded') {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk;
      });
      
      req.on('end', async () => {
        try {
          // Parse with parameter limit
          const parsed = qs.parse(body, '&', '=', {
            maxKeys: 1000 // Limit number of parameters
          });
          
          // Normalize arrays
          req.body = HPPProtection.normalizeParameterArrays(parsed);
          next();
        } catch (error) {
          next(error);
        }
      });
    } else {
      next();
    }
  };
};
