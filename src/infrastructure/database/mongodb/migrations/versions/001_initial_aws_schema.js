// src/infrastructure/database/mongodb/migrations/versions/001_initial_aws_schema.js
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";

/**
 * Initial AWS-optimized schema migration
 * Creates collections and indexes optimized for AWS deployment
 */

export const description = "Initial AWS-optimized schema with performance indexes";

export async function up(connection, session, context) {
  try {
    logger.info("🚀 Running initial AWS schema migration...");
    
    const db = connection.db;
    
    // Create collections with AWS-optimized settings
    await createAWSOptimizedCollections(db, session, context);
    
    // Create AWS-specific indexes
    await createAWSIndexes(db, session, context);
    
    // Create AWS monitoring collections
    await createMonitoringCollections(db, session, context);
    
    // Insert AWS-specific metadata
    await insertAWSMetadata(db, session, context);
    
    logger.info("✅ Initial AWS schema migration completed");
  } catch (error) {
    logger.error("❌ Initial AWS schema migration failed:", error);
    throw error;
  }
}

export async function down(connection, session, context) {
  try {
    logger.info("⬇️ Rolling back initial AWS schema migration...");
    
    const db = connection.db;
    
    // Drop AWS-specific collections
    const collectionsToRemove = [
      "aws_deployment_info",
      "aws_metrics",
      "aws_performance_logs"
    ];
    
    for (const collectionName of collectionsToRemove) {
      try {
        await db.collection(collectionName).drop({ session });
        logger.info(`Dropped collection: ${collectionName}`);
      } catch (error) {
        if (error.codeName !== "NamespaceNotFound") {
          throw error;
        }
      }
    }
    
    logger.info("✅ Initial AWS schema rollback completed");
  } catch (error) {
    logger.error("❌ Initial AWS schema rollback failed:", error);
    throw error;
  }
}

/**
 * Create AWS-optimized collections
 */
async function createAWSOptimizedCollections(db, session, context) {
  logger.info("📦 Creating AWS-optimized collections...");
  
  // Organizations collection with AWS metadata
  await db.createCollection("organizations", {
    session,
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["name", "tenantId", "createdAt"],
        properties: {
          name: { bsonType: "string" },
          tenantId: { bsonType: "string" },
          awsRegion: { bsonType: "string" },
          awsAccountId: { bsonType: "string" },
          deploymentType: { 
            bsonType: "string",
            enum: ["lambda", "ecs", "ec2", "fargate"]
          },
          createdAt: { bsonType: "date" }
        }
      }
    }
  });
  
  // Users collection optimized for AWS Lambda cold starts
  await db.createCollection("users", {
    session,
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["email", "organizationId", "createdAt"],
        properties: {
          email: { bsonType: "string" },
          organizationId: { bsonType: "objectId" },
          awsUserArn: { bsonType: "string" },
          lastAwsRegion: { bsonType: "string" },
          createdAt: { bsonType: "date" }
        }
      }
    }
  });
  
  // Schools collection with geo-distribution support
  await db.createCollection("schools", {
    session,
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["name", "organizationId", "createdAt"],
        properties: {
          name: { bsonType: "string" },
          organizationId: { bsonType: "objectId" },
          awsRegion: { bsonType: "string" },
          location: {
            bsonType: "object",
            properties: {
              type: { enum: ["Point"] },
              coordinates: {
                bsonType: "array",
                items: { bsonType: "double" }
              }
            }
          },
          createdAt: { bsonType: "date" }
        }
      }
    }
  });
}

/**
 * Create AWS-specific indexes for performance
 */
async function createAWSIndexes(db, session, context) {
  logger.info("🔍 Creating AWS-optimized indexes...");
  
  // Organizations indexes
  await db.collection("organizations").createIndexes([
    { key: { tenantId: 1 }, unique: true, background: true, session },
    { key: { awsRegion: 1, deploymentType: 1 }, background: true, session },
    { key: { createdAt: -1 }, background: true, session }
  ], { session });
  
  // Users indexes optimized for Lambda queries
  await db.collection("users").createIndexes([
    { key: { email: 1 }, unique: true, background: true, session },
    { key: { organizationId: 1, email: 1 }, unique: true, background: true, session },
    { key: { organizationId: 1, role: 1, isActive: 1 }, background: true, session },
    { key: { lastLoginAt: -1 }, background: true, session },
    { key: { awsUserArn: 1 }, sparse: true, background: true, session }
  ], { session });
  
  // Schools indexes with geospatial support
  await db.collection("schools").createIndexes([
    { key: { organizationId: 1, name: 1 }, unique: true, background: true, session },
    { key: { location: "2dsphere" }, background: true, session },
    { key: { awsRegion: 1, status: 1 }, background: true, session },
    { key: { "address.city": 1, "address.state": 1 }, background: true, session }
  ], { session });
}

/**
 * Create monitoring collections for AWS
 */
async function createMonitoringCollections(db, session, context) {
  logger.info("📊 Creating AWS monitoring collections...");
  
  // AWS deployment information
  await db.createCollection("aws_deployment_info", { session });
  await db.collection("aws_deployment_info").createIndexes([
    { key: { region: 1, environment: 1 }, background: true, session },
    { key: { deployedAt: -1 }, background: true, session }
  ], { session });
  
  // AWS metrics collection with TTL
  await db.createCollection("aws_metrics", { session });
  await db.collection("aws_metrics").createIndexes([
    { key: { timestamp: 1 }, expireAfterSeconds: 2592000, background: true, session }, // 30 days
    { key: { metricType: 1, timestamp: -1 }, background: true, session },
    { key: { region: 1, service: 1, timestamp: -1 }, background: true, session }
  ], { session });
  
  // Performance logs for Lambda cold starts
  await db.createCollection("aws_performance_logs", { session });
  await db.collection("aws_performance_logs").createIndexes([
    { key: { timestamp: 1 }, expireAfterSeconds: 604800, background: true, session }, // 7 days
    { key: { functionName: 1, coldStart: 1, timestamp: -1 }, background: true, session },
    { key: { region: 1, executionTime: -1 }, background: true, session }
  ], { session });
}

/**
 * Insert AWS-specific metadata
 */
async function insertAWSMetadata(db, session, context) {
  logger.info("📝 Inserting AWS deployment metadata...");
  
  const deploymentInfo = {
    _id: "aws_deployment_current",
    region: context.region,
    deploymentType: context.isLambda ? "lambda" : "container",
    schemaVersion: "1.0.0",
    migratedAt: new Date(),
    migrationId: `initial_${context.timestamp}`,
    awsServices: {
      lambda: context.isLambda,
      cloudWatch: !!process.env.CLOUDWATCH_LOG_GROUP,
      vpc: !!process.env.AWS_VPC_ID
    },
    performance: {
      connectionPoolSize: context.isLambda ? 1 : 10,
      readPreference: "primaryPreferred",
      retryWrites: true
    }
  };
  
  await db.collection("aws_deployment_info").insertOne(deploymentInfo, { session });
  
  // Log deployment info for audit
  await AuditService.log("AWS_INITIAL_SCHEMA_DEPLOYED", {
    region: context.region,
    deploymentType: deploymentInfo.deploymentType,
    schemaVersion: deploymentInfo.schemaVersion
  });
  
  logger.info("✅ AWS deployment metadata inserted");
}
