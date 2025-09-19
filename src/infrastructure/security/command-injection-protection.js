// src/infrastructure/security/command-injection-protection.js
import { logger } from "#utils/core/logger.js";
import { ValidationException } from "#shared/exceptions/validation.exception.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Command Injection Protection Service
 * Protects against OS command injection attacks
 */
export class CommandInjectionProtection {
  
  // Dangerous command patterns
  static DANGEROUS_PATTERNS = [
    // Command separators
    /[;&|`$(){}[\]]/,
    // Redirection operators
    /[<>]/,
    // Command substitution
    /\$\(|\`/,
    // Common dangerous commands
    /\b(rm|del|format|fdisk|mkfs|dd|cat|echo|eval|exec|system|shell|bash|sh|cmd|powershell|wget|curl|nc|netcat|telnet|ssh|ftp|python|perl|ruby|php|node|java)\b/i,
    // Path traversal
    /\.\.(\/|\\)/,
    // Null bytes
    /\x00/,
    // Newlines and carriage returns that could break command parsing
    /[\r\n]/
  ];

  // Allowed characters for safe commands
  static SAFE_CHARS = /^[a-zA-Z0-9\s\-_./:]+$/;

  /**
   * Validates input against command injection patterns
   * @param {string} input - Input to validate
   * @param {string} context - Context where input is used
   * @param {string} tenantId - Tenant ID
   * @returns {boolean} - True if safe
   */
  static async validateInput(input, context = 'unknown', tenantId = 'default') {
    try {
      if (!input || typeof input !== 'string') {
        return true;
      }

      // Check against dangerous patterns
      for (const pattern of this.DANGEROUS_PATTERNS) {
        if (pattern.test(input)) {
          await AuditService.log("COMMAND_INJECTION_ATTEMPT", {
            input: input.substring(0, 100),
            context,
            pattern: pattern.toString(),
            tenantId,
            severity: "CRITICAL"
          });

          logger.security("Command injection attempt detected", {
            input: input.substring(0, 50),
            context,
            tenantId
          });

          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error("Command injection validation failed", error);
      return false;
    }
  }

  /**
   * Sanitizes input by removing dangerous characters
   * @param {string} input - Input to sanitize
   * @param {boolean} strict - Use strict character filtering
   * @returns {string} - Sanitized input
   */
  static sanitizeInput(input, strict = true) {
    if (!input || typeof input !== 'string') {
      return input;
    }

    let sanitized = input;

    // Remove null bytes
    sanitized = sanitized.replace(/\x00/g, '');
    
    // Remove control characters
    sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
    
    // Remove dangerous characters
    sanitized = sanitized.replace(/[;&|`$(){}[\]<>]/g, '');
    
    if (strict) {
      // Keep only safe characters
      sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-_./:]/g, '');
    }

    return sanitized.trim();
  }

  /**
   * Safe command execution with parameter validation
   * @param {string} command - Base command
   * @param {Array} args - Command arguments
   * @param {Object} options - Execution options
   * @returns {Promise} - Command result
   */
  static async safeExecute(command, args = [], options = {}) {
    // Validate command
    if (!this.isWhitelistedCommand(command)) {
      throw new ValidationException(`Command not whitelisted: ${command}`, "COMMAND_NOT_ALLOWED");
    }

    // Validate arguments
    for (const arg of args) {
      if (!await this.validateInput(arg, 'command_argument')) {
        throw new ValidationException(`Dangerous argument detected: ${arg}`, "DANGEROUS_ARGUMENT");
      }
    }

    // Use spawn instead of exec for better security
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        ...options,
        shell: false, // Never use shell
        timeout: options.timeout || 30000,
        maxBuffer: options.maxBuffer || 1024 * 1024 // 1MB max output
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Checks if command is in whitelist
   * @param {string} command - Command to check
   * @returns {boolean} - True if whitelisted
   */
  static isWhitelistedCommand(command) {
    const whitelist = [
      // Add only necessary commands
      'node',
      'npm',
      'git',
      'mongodump',
      'mongorestore',
      'tar',
      'gzip',
      'zip',
      'unzip'
    ];

    return whitelist.includes(command);
  }

  /**
   * Validates file paths to prevent directory traversal
   * @param {string} filePath - File path to validate
   * @param {string} baseDir - Allowed base directory
   * @returns {boolean} - True if path is safe
   */
  static validateFilePath(filePath, baseDir) {
    if (!filePath || !baseDir) return false;

    try {
      const path = require('path');
      const resolvedPath = path.resolve(baseDir, filePath);
      const resolvedBase = path.resolve(baseDir);

      // Ensure the resolved path is within the base directory
      return resolvedPath.startsWith(resolvedBase + path.sep) || 
             resolvedPath === resolvedBase;
    } catch (error) {
      logger.error("File path validation error", error);
      return false;
    }
  }
}

// Middleware for command injection protection
export const commandInjectionMiddleware = () => {
  return async (req, res, next) => {
    try {
      const tenantId = req.context?.tenantId || 'default';
      
      // Check all string inputs for command injection patterns
      const validateInputs = async (obj, path = '') => {
        for (const [key, value] of Object.entries(obj || {})) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof value === 'string') {
            const isValid = await CommandInjectionProtection.validateInput(
              value, 
              currentPath, 
              tenantId
            );
            
            if (!isValid) {
              throw new ValidationException(
                `Potential command injection in field: ${currentPath}`,
                "COMMAND_INJECTION_DETECTED"
              );
            }
          } else if (typeof value === 'object' && value !== null) {
            await validateInputs(value, currentPath);
          }
        }
      };

      await validateInputs(req.body, 'body');
      await validateInputs(req.query, 'query');
      await validateInputs(req.params, 'params');

      next();
    } catch (error) {
      logger.error("Command injection middleware error", error);
      next(error);
    }
  };
};
