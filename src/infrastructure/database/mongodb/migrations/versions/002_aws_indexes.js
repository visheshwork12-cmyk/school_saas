// src/infrastructure/database/mongodb/migrations/versions/002_aws_indexes.js
import { logger } from "#utils/core/logger.js";

export const description = "AWS-specific performance indexes and compound indexes";

export async function up(connection, session, context) {
  try {
    logger.info("🚀 Creating AWS-specific performance indexes...");
    
    const db = connection.db;
    
    // Create compound indexes for AWS Lambda optimization
    await createLambdaOptimizedIndexes(db, session, context);
    
    // Create region-specific indexes
    await createRegionIndexes(db, session, context);
    
    // Create monitoring indexes
    await createMonitoringIndexes(db, session, context);
    
    // Create text search indexes
    await createTextSearchIndexes(db, session, context);
    
    logger.info("✅ AWS-specific indexes created successfully");
  } catch (error) {
    logger.error("❌ AWS index creation failed:", error);
    throw error;
  }
}

export async function down(connection, session, context) {
  try {
    logger.info("⬇️ Dropping AWS-specific indexes...");
    
    const db = connection.db;
    
    // Drop AWS-specific indexes (be careful not to drop essential ones)
    const indexesToDrop = [
      { collection: "organizations", index: "aws_region_deployment_compound" },
      { collection: "users", index: "aws_lambda_query_compound" },
      { collection: "schools", index: "aws_geo_region_compound" },
      { collection: "aws_metrics", index: "aws_metrics_analysis" }
    ];
    
    for (const { collection, index } of indexesToDrop) {
      try {
        await db.collection(collection).dropIndex(index, { session });
        logger.info(`Dropped index: ${collection}.${index}`);
      } catch (error) {
        if (error.codeName !== "IndexNotFound") {
          throw error;
        }
      }
    }
    
    logger.info("✅ AWS-specific indexes dropped");
  } catch (error) {
    logger.error("❌ AWS index rollback failed:", error);
    throw error;
  }
}

async function createLambdaOptimizedIndexes(db, session, context) {
  logger.info("⚡ Creating Lambda-optimized indexes...");
  
  // Users - optimized for Lambda authentication queries
  await db.collection("users").createIndex(
    {
      organizationId: 1,
      email: 1,
      isActive: 1,
      lastLoginAt: -1
    },
    {
      name: "aws_lambda_query_compound",
      background: true,
      session
    }
  );
  
  // Organizations - optimized for tenant resolution
  await db.collection("organizations").createIndex(
    {
      tenantId: 1,
      awsRegion: 1,
      status: 1,
      deploymentType: 1
    },
    {
      name: "aws_tenant_resolution_compound",
      background: true,
      session
    }
  );
  
  // Schools - optimized for multi-tenant queries
  await db.collection("schools").createIndex(
    {
      organizationId: 1,
      awsRegion: 1,
      status: 1,
      createdAt: -1
    },
    {
      name: "aws_school_tenant_compound",
      background: true,
      session
    }
  );
}

async function createRegionIndexes(db, session, context) {
  logger.info("🌍 Creating region-specific indexes...");
  
  // Organizations by region and deployment type
  await db.collection("organizations").createIndex(
    {
      awsRegion: 1,
      deploymentType: 1,
      createdAt: -1
    },
    {
      name: "aws_region_deployment_compound",
      background: true,
      session
    }
  );
  
  // Users by AWS region for data locality
  await db.collection("users").createIndex(
    {
      lastAwsRegion: 1,
      organizationId: 1,
      isActive: 1
    },
    {
      name: "aws_user_region_compound",
      background: true,
      session
    }
  );
  
  // Geospatial index for schools with region filter
  await db.collection("schools").createIndex(
    {
      awsRegion: 1,
      location: "2dsphere"
    },
    {
      name: "aws_geo_region_compound",
      background: true,
      session
    }
  );
}

async function createMonitoringIndexes(db, session, context) {
  logger.info("📊 Creating monitoring indexes...");
  
  // AWS metrics analysis
  await db.collection("aws_metrics").createIndex(
    {
      region: 1,
      service: 1,
      metricType: 1,
      timestamp: -1
    },
    {
      name: "aws_metrics_analysis",
      background: true,
      session
    }
  );
  
  // Performance logs for Lambda analysis
  await db.collection("aws_performance_logs").createIndex(
    {
      functionName: 1,
      region: 1,
      coldStart: 1,
      timestamp: -1
    },
    {
      name: "aws_lambda_performance",
      background: true,
      session
    }
  );
  
  // Audit logs with AWS context
  await db.collection("audit_logs").createIndex(
    {
      "awsContext.region": 1,
      "awsContext.service": 1,
      createdAt: -1
    },
    {
      name: "aws_audit_context",
      background: true,
      session,
      sparse: true
    }
  );
}

async function createTextSearchIndexes(db, session, context) {
  logger.info("🔍 Creating text search indexes...");
  
  // Organizations text search with region weighting
  await db.collection("organizations").createIndex(
    {
      name: "text",
      description: "text",
      "address.city": "text",
      awsRegion: 1
    },
    {
      name: "aws_organization_text_search",
      background: true,
      session,
      weights: {
        name: 10,
        description: 5,
        "address.city": 3
      }
    }
  );
  
  // Schools text search optimized for regional queries
  await db.collection("schools").createIndex(
    {
      name: "text",
      "address.area": "text",
      awsRegion: 1,
      organizationId: 1
    },
    {
      name: "aws_school_text_search",
      background: true,
      session,
      weights: {
        name: 10,
        "address.area": 5
      }
    }
  );
}
