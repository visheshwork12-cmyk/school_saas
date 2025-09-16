// src/infrastructure/database/mongodb/migrations/aws/aws-config-validator.js
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import baseConfig from "#shared/config/environments/base.config.js";

/**
 * AWS Configuration Validator for Migration Environment
 * Validates AWS settings and environment for safe migrations
 */
export class AWSConfigValidator {
  constructor() {
    this.validationResults = [];
    this.errors = [];
    this.warnings = [];
    this.awsRegion = process.env.AWS_REGION || "us-east-1";
    this.environment = process.env.NODE_ENV || "development";
  }

  /**
   * Validate complete AWS configuration
   */
  async validateAWSConfig() {
    try {
      logger.info("🔍 Validating AWS configuration for migrations...");
      
      await this.validateEnvironmentVariables();
      await this.validateAWSCredentials();
      await this.validateMongoDBConfig();
      await this.validateNetworking();
      await this.validateLambdaConfig();
      await this.validateCloudWatchConfig();
      await this.validateSecurityConfig();
      
      const results = this.generateValidationReport();
      
      if (this.errors.length > 0) {
        throw new Error(`AWS configuration validation failed: ${this.errors.join(", ")}`);
      }
      
      logger.info("✅ AWS configuration validation completed");
      return results;
    } catch (error) {
      logger.error("❌ AWS configuration validation failed:", error);
      throw error;
    }
  }

  /**
   * Validate required environment variables
   */
  async validateEnvironmentVariables() {
    logger.debug("📋 Validating environment variables...");
    
    const requiredVars = [
      "NODE_ENV",
      "MONGODB_URI",
      "AWS_REGION"
    ];
    
    const optionalVars = [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "AWS_LAMBDA_FUNCTION_NAME",
      "AWS_LAMBDA_FUNCTION_VERSION"
    ];
    
    // Check required variables
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        this.errors.push(`Missing required environment variable: ${varName}`);
      } else {
        this.validationResults.push({
          category: "environment",
          item: varName,
          status: "valid",
          value: this.maskSensitiveValue(varName, process.env[varName])
        });
      }
    }
    
    // Check optional variables
    for (const varName of optionalVars) {
      if (process.env[varName]) {
        this.validationResults.push({
          category: "environment",
          item: varName,
          status: "present",
          value: this.maskSensitiveValue(varName, process.env[varName])
        });
      }
    }
    
    // Validate specific values
    if (process.env.NODE_ENV && !["development", "staging", "production"].includes(process.env.NODE_ENV)) {
      this.warnings.push(`Unusual NODE_ENV value: ${process.env.NODE_ENV}`);
    }
    
    if (process.env.AWS_REGION && !this.isValidAWSRegion(process.env.AWS_REGION)) {
      this.warnings.push(`Unusual AWS region: ${process.env.AWS_REGION}`);
    }
  }

  /**
   * Validate AWS credentials
   */
  async validateAWSCredentials() {
    logger.debug("🔑 Validating AWS credentials...");
    
    const hasAccessKey = !!process.env.AWS_ACCESS_KEY_ID;
    const hasSecretKey = !!process.env.AWS_SECRET_ACCESS_KEY;
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    if (!isLambda) {
      if (!hasAccessKey || !hasSecretKey) {
        this.warnings.push("No explicit AWS credentials found - assuming IAM role or instance profile");
      } else {
        this.validationResults.push({
          category: "credentials",
          item: "aws_access_keys",
          status: "present"
        });
      }
    } else {
      this.validationResults.push({
        category: "credentials",
        item: "lambda_execution_role",
        status: "assumed"
      });
    }
    
    // Validate credential format
    if (hasAccessKey && !/^AKIA[0-9A-Z]{16}$/.test(process.env.AWS_ACCESS_KEY_ID)) {
      this.warnings.push("AWS Access Key ID format appears unusual");
    }
    
    if (hasSecretKey && process.env.AWS_SECRET_ACCESS_KEY.length !== 40) {
      this.warnings.push("AWS Secret Access Key length appears unusual");
    }
  }

  /**
   * Validate MongoDB configuration
   */
  async validateMongoDBConfig() {
    logger.debug("🗄️ Validating MongoDB configuration...");
    
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      this.errors.push("MONGODB_URI is required");
      return;
    }
    
    // Validate URI format
    if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
      this.errors.push("Invalid MongoDB URI format");
      return;
    }
    
    // Check for Atlas (recommended for AWS)
    if (mongoUri.includes("mongodb+srv://")) {
      this.validationResults.push({
        category: "mongodb",
        item: "atlas_connection",
        status: "detected"
      });
      
      // Validate Atlas-specific configurations
      if (!mongoUri.includes("retryWrites=true")) {
        this.warnings.push("Consider adding retryWrites=true to MongoDB URI");
      }
      
      if (!mongoUri.includes("w=majority")) {
        this.warnings.push("Consider adding w=majority to MongoDB URI");
      }
    } else {
      this.warnings.push("Not using MongoDB Atlas - consider Atlas for better AWS integration");
    }
    
    // Validate connection parameters
    const config = baseConfig.mongo;
    if (config) {
      if (config.options.maxPoolSize > 10 && process.env.AWS_LAMBDA_FUNCTION_NAME) {
        this.warnings.push("High maxPoolSize detected in Lambda environment");
      }
      
      this.validationResults.push({
        category: "mongodb",
        item: "connection_config",
        status: "valid",
        details: {
          maxPoolSize: config.options.maxPoolSize,
          serverSelectionTimeoutMS: config.options.serverSelectionTimeoutMS
        }
      });
    }
  }

  /**
   * Validate networking configuration
   */
  async validateNetworking() {
    logger.debug("🌐 Validating networking configuration...");
    
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const vpcId = process.env.AWS_VPC_ID;
    const subnetIds = process.env.AWS_SUBNET_IDS;
    
    if (isLambda) {
      if (vpcId && subnetIds) {
        this.validationResults.push({
          category: "networking",
          item: "lambda_vpc",
          status: "configured"
        });
        
        // VPC Lambda has different networking considerations
        this.warnings.push("Lambda in VPC detected - ensure NAT gateway for external connectivity");
      } else {
        this.validationResults.push({
          category: "networking",
          item: "lambda_vpc",
          status: "public"
        });
      }
    }
    
    // Check for Atlas IP whitelist considerations
    if (process.env.MONGODB_URI?.includes("mongodb+srv://")) {
      if (!isLambda) {
        this.warnings.push("Ensure Atlas IP whitelist includes AWS resources");
      } else {
        this.warnings.push("Lambda IPs are dynamic - consider Atlas Private Endpoint");
      }
    }
  }

  /**
   * Validate Lambda-specific configuration
   */
  async validateLambdaConfig() {
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    if (!isLambda) {
      return;
    }
    
    logger.debug("⚡ Validating Lambda configuration...");
    
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    const functionVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION;
    const memorySize = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
    const timeout = process.env.AWS_LAMBDA_FUNCTION_TIMEOUT;
    
    this.validationResults.push({
      category: "lambda",
      item: "function_info",
      status: "detected",
      details: {
        name: functionName,
        version: functionVersion,
        memory: memorySize,
        timeout: timeout
      }
    });
    
    // Validate timeout for migrations
    if (timeout && parseInt(timeout) < 300) {
      this.warnings.push("Lambda timeout < 5 minutes may be insufficient for migrations");
    }
    
    // Validate memory for database operations
    if (memorySize && parseInt(memorySize) < 512) {
      this.warnings.push("Lambda memory < 512MB may be insufficient for migrations");
    }
  }

  /**
   * Validate CloudWatch configuration
   */
  async validateCloudWatchConfig() {
    logger.debug("📊 Validating CloudWatch configuration...");
    
    const logGroup = process.env.CLOUDWATCH_LOG_GROUP;
    const logStream = process.env.CLOUDWATCH_LOG_STREAM;
    const cwEnabled = baseConfig.aws?.cloudWatch?.enabled;
    
    if (cwEnabled) {
      this.validationResults.push({
        category: "cloudwatch",
        item: "monitoring",
        status: "enabled"
      });
      
      if (logGroup) {
        this.validationResults.push({
          category: "cloudwatch",
          item: "log_group",
          status: "configured",
          value: logGroup
        });
      }
    } else {
      this.warnings.push("CloudWatch monitoring not enabled - consider enabling for production");
    }
  }

  /**
   * Validate security configuration
   */
  async validateSecurityConfig() {
    logger.debug("🔒 Validating security configuration...");
    
    // Check encryption in transit
    if (process.env.MONGODB_URI?.includes("ssl=false")) {
      this.errors.push("SSL disabled for MongoDB connection - security risk");
    }
    
    // Check environment-based security
    if (this.environment === "production") {
      if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
        this.errors.push("Weak JWT secret in production environment");
      }
      
      if (process.env.NODE_ENV !== "production") {
        this.warnings.push("NODE_ENV should be 'production' in production environment");
      }
    }
    
    // Check for sensitive data in logs
    if (process.env.DEBUG === "true" && this.environment === "production") {
      this.warnings.push("Debug mode enabled in production - potential security risk");
    }
    
    this.validationResults.push({
      category: "security",
      item: "environment_check",
      status: "completed"
    });
  }

  /**
   * Generate comprehensive validation report
   */
  generateValidationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      region: this.awsRegion,
      summary: {
        total_checks: this.validationResults.length,
        errors: this.errors.length,
        warnings: this.warnings.length,
        status: this.errors.length === 0 ? "PASS" : "FAIL"
      },
      results: this.validationResults,
      errors: this.errors,
      warnings: this.warnings,
      recommendations: this.generateRecommendations()
    };
    
    // Log validation summary
    logger.info(`📊 Validation Summary: ${report.summary.status}`, {
      errors: report.summary.errors,
      warnings: report.summary.warnings,
      checks: report.summary.total_checks
    });
    
    if (this.warnings.length > 0) {
      logger.warn("⚠️ Configuration warnings:", this.warnings);
    }
    
    if (this.errors.length > 0) {
      logger.error("❌ Configuration errors:", this.errors);
    }
    
    return report;
  }

  /**
   * Generate recommendations based on validation results
   */
  generateRecommendations() {
    const recommendations = [];
    
    // MongoDB recommendations
    if (!process.env.MONGODB_URI?.includes("mongodb+srv://")) {
      recommendations.push("Consider using MongoDB Atlas for better AWS integration");
    }
    
    // Lambda recommendations
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      recommendations.push("Use connection pooling with maxPoolSize=1 for Lambda");
      recommendations.push("Consider Lambda provisioned concurrency for consistent performance");
    }
    
    // Security recommendations
    if (this.environment === "production") {
      recommendations.push("Enable CloudWatch monitoring for production deployments");
      recommendations.push("Use AWS Secrets Manager for sensitive configuration");
      recommendations.push("Enable VPC endpoints for private connectivity");
    }
    
    // Performance recommendations
    recommendations.push("Use read replicas for read-heavy migration operations");
    recommendations.push("Consider Atlas Global Clusters for multi-region deployments");
    
    return recommendations;
  }

  /**
   * Utility methods
   */
  maskSensitiveValue(key, value) {
    const sensitiveKeys = ["SECRET", "PASSWORD", "KEY", "TOKEN"];
    if (sensitiveKeys.some(k => key.toUpperCase().includes(k))) {
      return value ? `${value.substring(0, 4)}****` : null;
    }
    return value;
  }

  isValidAWSRegion(region) {
    const validRegions = [
      "us-east-1", "us-east-2", "us-west-1", "us-west-2",
      "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1",
      "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1"
    ];
    return validRegions.includes(region);
  }

  /**
   * Export validation report to file
   */
  async exportReport(filePath = `/tmp/aws-migration-validation-${Date.now()}.json`) {
    const report = this.generateValidationReport();
    
    try {
      const fs = await import("fs/promises");
      await fs.writeFile(filePath, JSON.stringify(report, null, 2));
      logger.info(`📄 Validation report exported to: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error("Failed to export validation report:", error);
      throw error;
    }
  }
}

export default AWSConfigValidator;
