// src/infrastructure/security/sql-injection-protection.js
import { logger } from "#utils/core/logger.js";
import { ValidationException } from "#shared/exceptions/validation.exception.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";

/**
 * SQL Injection Protection Service
 * Protects against SQL injection attacks even in NoSQL environments
 */
export class SQLInjectionProtection {
  
  // SQL injection patterns
  static SQL_INJECTION_PATTERNS = [
    /(\s*((\%27)|(\')|(\")|(\%22))+.*((\%6F)|o|(\%4F))+.*((\%72)|r|(\%52))+)/i,
    /(\s*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52)))/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\")|(\%22))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52)))/i,
    /(\%27)|(\')(((\%6F)|o|(\%4F))+((\%72)|r|(\%52))+)*((\s)|(\%20))*((\%22)|(\")|((\%27)|(\')))/i,
    /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i,
    /(((\%27)|(\'))+((\%6F)|o|(\%4F))+.*((\%65)|e|(\%45))+)/i,
    /((\%3C)|<)[^\n]+(((\%3E)|>))/i,
    /select|insert|update|delete|drop|create|alter|exec|execute|union|script/i,
    /or\s+1\s*=\s*1|and\s+1\s*=\s*1/i,
    /'\s*or\s*'[^']*'\s*=\s*'/i,
    /union\s+select/i,
    /information_schema/i,
    /load_file|into\s+outfile|into\s+dumpfile/i,
    /xp_cmdshell|sp_executesql/i
  ];

  /**
   * Validates input against SQL injection patterns
   * @param {string} input - Input to validate
   * @param {string} fieldName - Field name for logging
   * @param {string} tenantId - Tenant ID
   * @returns {boolean} - True if safe
   */
  static async validateInput(input, fieldName = 'unknown', tenantId = 'default') {
    try {
      if (!input || typeof input !== 'string') {
        return true; // Non-string inputs are safe from SQL injection
      }

      // Decode URL-encoded input
      const decodedInput = decodeURIComponent(input);
      
      // Check against patterns
      for (const pattern of this.SQL_INJECTION_PATTERNS) {
        if (pattern.test(decodedInput)) {
          // Log potential SQL injection attempt
          await AuditService.log("SQL_INJECTION_ATTEMPT", {
            fieldName,
            input: input.substring(0, 100), // Limit logged input
            pattern: pattern.toString(),
            tenantId,
            severity: "HIGH"
          });

          logger.security("SQL injection attempt detected", {
            fieldName,
            pattern: pattern.toString(),
            tenantId
          });

          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error("SQL injection validation failed", error);
      return false; // Fail secure
    }
  }

  /**
   * Sanitizes input by removing dangerous SQL patterns
   * @param {string} input - Input to sanitize
   * @returns {string} - Sanitized input
   */
  static sanitizeInput(input) {
    if (!input || typeof input !== 'string') {
      return input;
    }

    let sanitized = input;
    
    // Remove SQL keywords
    sanitized = sanitized.replace(/select|insert|update|delete|drop|create|alter|exec|execute|union|script/gi, '');
    
    // Remove SQL operators
    sanitized = sanitized.replace(/(\s*or\s*1\s*=\s*1)|(\s*and\s*1\s*=\s*1)/gi, '');
    
    // Remove quotes in dangerous contexts
    sanitized = sanitized.replace(/'\s*or\s*'/gi, '');
    
    // Remove SQL comments
    sanitized = sanitized.replace(/-{2,}.*?(\r\n|\r|\n|$)/g, '');
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
    
    return sanitized.trim();
  }

  /**
   * Validates parameterized query structure
   * @param {string} query - Query template
   * @param {Array} params - Parameters array
   * @returns {boolean} - True if properly parameterized
   */
  static validateParameterizedQuery(query, params = []) {
    // Check for direct concatenation patterns
    const dangerousPatterns = [
      /\+\s*['"`]/,  // String concatenation
      /\$\{.*\}/,    // Template literals
      /\%s|\%d/      // Printf-style formatting
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return false;
      }
    }

    // Ensure placeholders match parameters
    const placeholderCount = (query.match(/\?/g) || []).length;
    if (placeholderCount !== params.length) {
      return false;
    }

    return true;
  }
}

// Middleware for SQL injection protection
export const sqlInjectionMiddleware = () => {
  return async (req, res, next) => {
    try {
      const tenantId = req.context?.tenantId || 'default';
      
      // Check all string inputs
      const checkInputs = async (obj, prefix = '') => {
        for (const [key, value] of Object.entries(obj || {})) {
          const fieldPath = prefix ? `${prefix}.${key}` : key;
          
          if (typeof value === 'string') {
            const isValid = await SQLInjectionProtection.validateInput(
              value, 
              fieldPath, 
              tenantId
            );
            
            if (!isValid) {
              throw new ValidationException(
                `Potential SQL injection detected in field: ${fieldPath}`,
                "SQL_INJECTION_DETECTED"
              );
            }
          } else if (typeof value === 'object' && value !== null) {
            await checkInputs(value, fieldPath);
          }
        }
      };

      // Check body, query, and params
      await checkInputs(req.body, 'body');
      await checkInputs(req.query, 'query');
      await checkInputs(req.params, 'params');

      next();
    } catch (error) {
      logger.error("SQL injection middleware error", error);
      next(error);
    }
  };
};
