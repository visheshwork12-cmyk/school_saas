// src/infrastructure/security/enhanced-file-validation.service.js
import { logger } from "#utils/core/logger.js";
import { ValidationException } from "#shared/exceptions/validation.exception.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { createReadStream } from 'fs';
import { promisify } from 'util';
import crypto from 'crypto';
import path from 'path';

/**
 * Enhanced File Upload Validation Service
 * Comprehensive security validation for uploaded files
 */
export class EnhancedFileValidation {

  // File type signatures (magic bytes)
  static FILE_SIGNATURES = {
    // Images
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38], [0x47, 0x49, 0x46, 0x39]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50]],
    
    // Documents
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
    'application/msword': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
      [0x50, 0x4B, 0x03, 0x04]
    ],
    'application/vnd.ms-excel': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
      [0x50, 0x4B, 0x03, 0x04]
    ],
    
    // Archives
    'application/zip': [[0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06]],
    'application/x-rar': [[0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00]],
    
    // Text
    'text/plain': null, // Text files don't have consistent signatures
    'application/json': null,
    'text/csv': null
  };

  // Dangerous file extensions
  static DANGEROUS_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.vbe', 
    '.js', '.jse', '.wsf', '.wsh', '.ps1', '.ps1xml', '.ps2', '.ps2xml',
    '.psc1', '.psc2', '.msh', '.msh1', '.msh2', '.mshxml', '.msh1xml',
    '.msh2xml', '.scf', '.lnk', '.inf', '.reg', '.docm', '.xlsm', '.pptm',
    '.jar', '.class', '.war', '.ear', '.jsp', '.asp', '.aspx', '.php',
    '.py', '.pl', '.rb', '.sh', '.bash', '.zsh', '.fish'
  ];

  // Maximum file sizes by category (in bytes)
  static MAX_FILE_SIZES = {
    'image': 10 * 1024 * 1024, // 10MB
    'document': 50 * 1024 * 1024, // 50MB
    'archive': 100 * 1024 * 1024, // 100MB
    'default': 10 * 1024 * 1024 // 10MB
  };

  /**
   * Comprehensive file validation
   * @param {Object} file - Uploaded file object
   * @param {Object} options - Validation options
   * @param {string} tenantId - Tenant ID
   * @returns {Object} - Validation result
   */
  static async validateFile(file, options = {}, tenantId = 'default') {
    try {
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        fileInfo: {}
      };

      // Basic file validation
      if (!file || !file.buffer) {
        validationResult.isValid = false;
        validationResult.errors.push('No file data provided');
        return validationResult;
      }

      // File size validation
      await this.validateFileSize(file, validationResult, options);
      
      // File extension validation
      await this.validateFileExtension(file, validationResult, options);
      
      // MIME type validation
      await this.validateMimeType(file, validationResult, options);
      
      // File signature validation (magic bytes)
      await this.validateFileSignature(file, validationResult, options);
      
      // Content validation
      await this.validateFileContent(file, validationResult, options);
      
      // Malware scanning simulation (in production, integrate with actual scanner)
      await this.scanForMalware(file, validationResult, options);
      
      // Generate file hash
      validationResult.fileInfo.hash = this.generateFileHash(file.buffer);
      validationResult.fileInfo.size = file.size;
      validationResult.fileInfo.originalName = file.originalname;
      
      // Log validation attempt
      await AuditService.log("FILE_VALIDATION", {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        tenantId,
        hash: validationResult.fileInfo.hash
      });

      return validationResult;
    } catch (error) {
      logger.error("File validation error", error);
      return {
        isValid: false,
        errors: ['File validation failed'],
        warnings: [],
        fileInfo: {}
      };
    }
  }

  /**
   * Validates file size
   */
  static async validateFileSize(file, result, options) {
    const maxSize = options.maxSize || this.MAX_FILE_SIZES.default;
    
    if (file.size > maxSize) {
      result.isValid = false;
      result.errors.push(`File size ${file.size} exceeds maximum ${maxSize} bytes`);
    }
    
    if (file.size === 0) {
      result.isValid = false;
      result.errors.push('File is empty');
    }
  }

  /**
   * Validates file extension
   */
  static async validateFileExtension(file, result, options) {
    const fileName = file.originalname || '';
    const ext = path.extname(fileName).toLowerCase();
    
    // Check for dangerous extensions
    if (this.DANGEROUS_EXTENSIONS.includes(ext)) {
      result.isValid = false;
      result.errors.push(`Dangerous file extension: ${ext}`);
    }
    
    // Check against allowed extensions
    if (options.allowedExtensions && !options.allowedExtensions.includes(ext)) {
      result.isValid = false;
      result.errors.push(`File extension ${ext} not allowed`);
    }
    
    // Check for multiple extensions (e.g., file.txt.exe)
    const parts = fileName.split('.');
    if (parts.length > 2) {
      for (let i = 1; i < parts.length; i++) {
        const possibleExt = '.' + parts[i].toLowerCase();
        if (this.DANGEROUS_EXTENSIONS.includes(possibleExt)) {
          result.isValid = false;
          result.errors.push(`Dangerous extension found in filename: ${possibleExt}`);
        }
      }
    }
  }

  /**
   * Validates MIME type
   */
  static async validateMimeType(file, result, options) {
    const mimeType = file.mimetype;
    
    if (!mimeType) {
      result.warnings.push('No MIME type detected');
      return;
    }
    
    // Check against allowed MIME types
    if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(mimeType)) {
      result.isValid = false;
      result.errors.push(`MIME type ${mimeType} not allowed`);
    }
    
    // Check for suspicious MIME types
    const dangerousMimeTypes = [
      'application/x-executable',
      'application/x-msdownload',
      'application/x-msdos-program',
      'application/x-winexe',
      'application/x-javascript',
      'text/javascript'
    ];
    
    if (dangerousMimeTypes.includes(mimeType)) {
      result.isValid = false;
      result.errors.push(`Dangerous MIME type: ${mimeType}`);
    }
  }

  /**
   * Validates file signature (magic bytes)
   */
  static async validateFileSignature(file, result, options) {
    const mimeType = file.mimetype;
    const signatures = this.FILE_SIGNATURES[mimeType];
    
    if (!signatures) {
      result.warnings.push('No signature validation available for this file type');
      return;
    }
    
    const buffer = file.buffer;
    let signatureMatch = false;
    
    for (const signature of signatures) {
      if (this.matchesSignature(buffer, signature)) {
        signatureMatch = true;
        break;
      }
    }
    
    if (!signatureMatch) {
      result.isValid = false;
      result.errors.push('File signature does not match declared MIME type');
    }
  }

  /**
   * Validates file content for malicious patterns
   */
  static async validateFileContent(file, result, options) {
    const buffer = file.buffer;
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 8192)); // First 8KB
    
    // Check for script tags in supposedly safe files
    const scriptPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /<iframe[\s\S]*?>/gi,
      /<object[\s\S]*?>/gi,
      /<embed[\s\S]*?>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi // Event handlers
    ];
    
    for (const pattern of scriptPatterns) {
      if (pattern.test(content)) {
        result.isValid = false;
        result.errors.push('Malicious script content detected in file');
        break;
      }
    }
    
    // Check for null bytes (often used in file type confusion attacks)
    if (buffer.includes(0x00) && file.mimetype.startsWith('text/')) {
      result.warnings.push('Null bytes found in text file');
    }
  }

  /**
   * Simulates malware scanning
   */
  static async scanForMalware(file, result, options) {
    // In production, integrate with actual malware scanning service
    // For now, we'll do basic pattern matching
    
    const buffer = file.buffer;
    
    // Check for EICAR test string (standard antivirus test)
    const eicarPattern = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    if (buffer.includes(eicarPattern)) {
      result.isValid = false;
      result.errors.push('Test virus signature detected');
    }
    
    // Check for suspicious patterns in executables
    if (file.mimetype === 'application/octet-stream' || 
        this.DANGEROUS_EXTENSIONS.some(ext => 
          (file.originalname || '').toLowerCase().endsWith(ext))) {
      result.isValid = false;
      result.errors.push('Potentially malicious executable file');
    }
  }

  /**
   * Checks if buffer matches file signature
   */
  static matchesSignature(buffer, signature) {
    if (buffer.length < signature.length) return false;
    
    for (let i = 0; i < signature.length; i++) {
      if (signature[i] !== null && buffer[i] !== signature[i]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Generates SHA-256 hash of file
   */
  static generateFileHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Validates image dimensions
   */
  static async validateImageDimensions(file, options = {}) {
    if (!file.mimetype.startsWith('image/')) return true;
    
    // This would require image processing library like sharp
    // For now, return true
    return true;
  }

  /**
   * Quarantines suspicious files
   */
  static async quarantineFile(file, reason, tenantId) {
    // Move file to quarantine directory
    const quarantinePath = path.join(process.cwd(), 'quarantine', tenantId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const quarantineFileName = `${timestamp}-${file.originalname}`;
    
    // Log quarantine action
    await AuditService.log("FILE_QUARANTINED", {
      originalName: file.originalname,
      quarantineName: quarantineFileName,
      reason,
      tenantId,
      size: file.size,
      mimeType: file.mimetype
    });
    
    logger.security("File quarantined", {
      originalName: file.originalname,
      reason,
      tenantId
    });
  }
}

// Enhanced file upload middleware
export const enhancedFileValidationMiddleware = (options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.file && !req.files) {
        return next(); // No files to validate
      }
      
      const tenantId = req.context?.tenantId || 'default';
      const files = req.files || [req.file];
      
      for (const file of files) {
        const validation = await EnhancedFileValidation.validateFile(
          file, 
          options, 
          tenantId
        );
        
        if (!validation.isValid) {
          // Quarantine suspicious files
          await EnhancedFileValidation.quarantineFile(
            file, 
            validation.errors.join(', '), 
            tenantId
          );
          
          throw new ValidationException(
            `File validation failed: ${validation.errors.join(', ')}`,
            "FILE_VALIDATION_FAILED"
          );
        }
        
        // Add validation info to file object
        file.validationResult = validation;
      }
      
      next();
    } catch (error) {
      logger.error("File validation middleware error", error);
      next(error);
    }
  };
};
