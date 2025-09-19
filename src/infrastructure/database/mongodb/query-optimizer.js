// src/infrastructure/database/mongodb/query-optimizer.js
import { logger } from "#utils/core/logger.js";
import { CacheService } from "#core/cache/services/unified-cache.service.js";
import crypto from "crypto";

/**
 * MongoDB Query Optimizer with Explain Plan Analysis
 */
export class QueryOptimizer {
  constructor() {
    this.explainCache = new Map();
    this.slowQueryThreshold = 100; // ms
    this.queryPatterns = new Map();
    this.optimizationRules = new Map();
    this.initializeOptimizationRules();
  }

  /**
   * Initialize query optimization rules
   */
  initializeOptimizationRules() {
    // Collection scan rule
    this.optimizationRules.set('AVOID_COLLECTION_SCAN', {
      detect: (explainResult) => {
        return this.hasCollectionScan(explainResult);
      },
      recommend: (query, explainResult) => {
        const fields = this.extractQueriedFields(query);
        return {
          type: 'CREATE_INDEX',
          message: 'Query performs collection scan. Consider creating index.',
          suggestedIndex: this.suggestIndex(fields),
          impact: 'HIGH',
          estimatedImprovement: '50-90%'
        };
      }
    });

    // Sort without index rule
    this.optimizationRules.set('SORT_WITHOUT_INDEX', {
      detect: (explainResult) => {
        return this.hasSortWithoutIndex(explainResult);
      },
      recommend: (query, explainResult) => {
        const sortFields = this.extractSortFields(query);
        return {
          type: 'CREATE_SORT_INDEX',
          message: 'Sort operation without index detected.',
          suggestedIndex: this.suggestSortIndex(query),
          impact: 'HIGH',
          estimatedImprovement: '60-95%'
        };
      }
    });

    // Large result set rule
    this.optimizationRules.set('LARGE_RESULT_SET', {
      detect: (explainResult) => {
        return explainResult.executionStats?.totalDocsExamined > 10000;
      },
      recommend: (query, explainResult) => {
        return {
          type: 'ADD_LIMIT_PAGINATION',
          message: 'Query examines large number of documents.',
          suggestion: 'Consider adding limit() and pagination',
          impact: 'MEDIUM',
          estimatedImprovement: '30-70%'
        };
      }
    });

    // Inefficient regex rule
    this.optimizationRules.set('INEFFICIENT_REGEX', {
      detect: (explainResult, query) => {
        return this.hasInefficientRegex(query);
      },
      recommend: (query, explainResult) => {
        return {
          type: 'OPTIMIZE_REGEX',
          message: 'Inefficient regex pattern detected.',
          suggestion: 'Use anchored regex patterns or text search',
          impact: 'MEDIUM',
          estimatedImprovement: '40-80%'
        };
      }
    });
  }

  /**
   * Analyze query performance and provide recommendations
   */
  async analyzeQuery(collection, query, options = {}) {
    try {
      const startTime = Date.now();
      
      // Generate query signature for caching
      const querySignature = this.generateQuerySignature(query, options);
      
      // Check cache first
      const cachedResult = await this.getCachedExplainResult(querySignature);
      if (cachedResult && !options.forceFresh) {
        return cachedResult;
      }

      // Execute explain plan
      const explainResult = await this.executeExplainPlan(collection, query, options);
      
      // Analyze performance
      const analysis = this.performQueryAnalysis(query, explainResult, options);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(query, explainResult, analysis);
      
      // Store query pattern for learning
      this.storeQueryPattern(querySignature, query, explainResult, analysis);

      const result = {
        querySignature,
        query,
        explainResult,
        analysis,
        recommendations,
        executionTime: Date.now() - startTime,
        timestamp: new Date()
      };

      // Cache result
      await this.cacheExplainResult(querySignature, result);

      // Log slow queries
      if (analysis.averageExecutionTime > this.slowQueryThreshold) {
        await this.logSlowQuery(result);
      }

      return result;

    } catch (error) {
      logger.error('Query analysis failed:', error);
      throw error;
    }
  }

  /**
   * Execute explain plan with detailed analysis
   */
  async executeExplainPlan(collection, query, options = {}) {
    const explainOptions = {
      verbosity: 'executionStats', // Get detailed execution statistics
      ...options.explainOptions
    };

    let explainResult;

    try {
      if (options.sort) {
        explainResult = await collection.find(query)
          .sort(options.sort)
          .limit(options.limit || 0)
          .explain(explainOptions.verbosity);
      } else if (options.aggregate) {
        explainResult = await collection.aggregate(query)
          .explain(explainOptions.verbosity);
      } else {
        explainResult = await collection.find(query)
          .limit(options.limit || 0)
          .explain(explainOptions.verbosity);
      }

      return explainResult;

    } catch (error) {
      logger.error('Explain plan execution failed:', error);
      throw error;
    }
  }

  /**
   * Perform comprehensive query analysis
   */
  performQueryAnalysis(query, explainResult, options = {}) {
    const stats = explainResult.executionStats || {};
    
    const analysis = {
      // Execution metrics
      executionTimeMS: stats.executionTimeMS || 0,
      totalDocsExamined: stats.totalDocsExamined || 0,
      totalDocsReturned: stats.totalDocsReturned || 0,
      executionStages: this.analyzeExecutionStages(explainResult),
      
      // Efficiency metrics
      efficiency: this.calculateQueryEfficiency(stats),
      indexUsage: this.analyzeIndexUsage(explainResult),
      
      // Performance indicators
      isSlowQuery: (stats.executionTimeMS || 0) > this.slowQueryThreshold,
      hasCollectionScan: this.hasCollectionScan(explainResult),
      hasSort: this.hasSort(explainResult),
      hasLimit: this.hasLimit(explainResult),
      
      // Resource usage
      keysExamined: stats.totalKeysExamined || 0,
      docsExamined: stats.totalDocsExamined || 0,
      docsReturned: stats.totalDocsReturned || 0,
      
      // Query characteristics
      queryType: this.determineQueryType(query, options),
      complexity: this.calculateQueryComplexity(query),
      
      // Index recommendations
      needsIndex: this.needsIndex(explainResult),
      suggestedIndexes: this.suggestIndexes(query, explainResult)
    };

    // Calculate additional metrics
    analysis.selectivity = analysis.docsReturned / Math.max(analysis.docsExamined, 1);
    analysis.indexEfficiency = analysis.keysExamined / Math.max(analysis.docsExamined, 1);
    analysis.averageExecutionTime = analysis.executionTimeMS;

    return analysis;
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(query, explainResult, analysis) {
    const recommendations = [];

    // Apply optimization rules
    for (const [ruleName, rule] of this.optimizationRules) {
      if (rule.detect(explainResult, query)) {
        const recommendation = rule.recommend(query, explainResult);
        recommendation.rule = ruleName;
        recommendations.push(recommendation);
      }
    }

    // Add query-specific recommendations
    if (analysis.efficiency < 0.1) {
      recommendations.push({
        type: 'POOR_EFFICIENCY',
        message: `Query efficiency is very low (${(analysis.efficiency * 100).toFixed(1)}%)`,
        suggestion: 'Review query structure and consider adding appropriate indexes',
        impact: 'HIGH'
      });
    }

    if (analysis.executionTimeMS > 1000) {
      recommendations.push({
        type: 'VERY_SLOW_QUERY',
        message: `Query execution time is very high (${analysis.executionTimeMS}ms)`,
        suggestion: 'Consider query optimization, indexing, or pagination',
        impact: 'CRITICAL'
      });
    }

    // Sort recommendations by impact
    return recommendations.sort((a, b) => {
      const impactOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    });
  }

  /**
   * Generate index creation recommendations
   */
  generateIndexRecommendations(collection, analysisResults = []) {
    const indexRecommendations = new Map();

    for (const result of analysisResults) {
      if (result.analysis.needsIndex) {
        for (const suggestedIndex of result.analysis.suggestedIndexes) {
          const indexKey = JSON.stringify(suggestedIndex.fields);
          
          if (!indexRecommendations.has(indexKey)) {
            indexRecommendations.set(indexKey, {
              fields: suggestedIndex.fields,
              queries: [],
              estimatedImpact: 0,
              priority: 0
            });
          }

          const recommendation = indexRecommendations.get(indexKey);
          recommendation.queries.push({
            query: result.query,
            executionTime: result.analysis.executionTimeMS,
            frequency: this.getQueryFrequency(result.querySignature)
          });
          
          // Calculate cumulative impact
          recommendation.estimatedImpact += result.analysis.executionTimeMS * 
            this.getQueryFrequency(result.querySignature);
        }
      }
    }

    // Convert to array and sort by impact
    return Array.from(indexRecommendations.values())
      .map(rec => ({
        ...rec,
        priority: this.calculateIndexPriority(rec)
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Create optimized indexes based on recommendations
   */
  async createOptimizedIndexes(collection, recommendations, options = {}) {
    const results = [];

    for (const recommendation of recommendations) {
      try {
        if (recommendation.priority < (options.minPriority || 0.5)) {
          continue; // Skip low-priority indexes
        }

        const indexSpec = this.buildIndexSpec(recommendation);
        
        logger.info(`Creating optimized index: ${JSON.stringify(indexSpec.fields)}`);
        
        const indexName = await collection.createIndex(
          indexSpec.fields, 
          indexSpec.options
        );

        results.push({
          indexName,
          fields: indexSpec.fields,
          options: indexSpec.options,
          estimatedImpact: recommendation.estimatedImpact,
          status: 'created'
        });

        logger.info(`Index created successfully: ${indexName}`);

      } catch (error) {
        logger.error(`Failed to create index:`, error);
        results.push({
          fields: recommendation.fields,
          error: error.message,
          status: 'failed'
        });
      }
    }

    return results;
  }

  /**
   * Monitor query performance over time
   */
  async startQueryPerformanceMonitoring(collections) {
    const monitoringInterval = setInterval(async () => {
      try {
        for (const collection of collections) {
          await this.collectSlowQueries(collection);
          await this.updateQueryPatterns(collection);
        }
      } catch (error) {
        logger.error('Query performance monitoring error:', error);
      }
    }, 300000); // Every 5 minutes

    return monitoringInterval;
  }

  /**
   * Collect slow queries from MongoDB profiler
   */
  async collectSlowQueries(collection) {
    try {
      // Enable profiler if not already enabled
      await collection.db.runCommand({
        profile: 2, // Profile all operations
        slowms: this.slowQueryThreshold
      });

      // Get slow queries from system.profile
      const slowQueries = await collection.db
        .collection('system.profile')
        .find({
          ts: { $gte: new Date(Date.now() - 300000) }, // Last 5 minutes
          millis: { $gte: this.slowQueryThreshold }
        })
        .sort({ ts: -1 })
        .limit(100)
        .toArray();

      // Analyze each slow query
      for (const slowQuery of slowQueries) {
        await this.analyzeSlowQueryFromProfiler(collection, slowQuery);
      }

    } catch (error) {
      logger.error('Failed to collect slow queries:', error);
    }
  }

  /**
   * Generate query performance report
   */
  async generatePerformanceReport(collection, timeRange = { hours: 24 }) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (timeRange.hours * 60 * 60 * 1000));

    const report = {
      collection: collection.collectionName,
      timeRange: { startTime, endTime },
      summary: {
        totalQueries: 0,
        slowQueries: 0,
        averageExecutionTime: 0,
        queryTypes: new Map(),
        indexUsage: new Map()
      },
      topSlowQueries: [],
      recommendations: [],
      indexAnalysis: {
        existing: [],
        recommended: [],
        unused: []
      }
    };

    try {
      // Collect query statistics
      const queryStats = await this.collectQueryStatistics(collection, startTime, endTime);
      
      // Generate index analysis
      const indexAnalysis = await this.analyzeExistingIndexes(collection);
      
      // Compile report
      report.summary = queryStats.summary;
      report.topSlowQueries = queryStats.slowQueries.slice(0, 10);
      report.recommendations = await this.generatePerformanceRecommendations(queryStats);
      report.indexAnalysis = indexAnalysis;

      return report;

    } catch (error) {
      logger.error('Failed to generate performance report:', error);
      throw error;
    }
  }

  // Helper methods
  generateQuerySignature(query, options = {}) {
    const queryString = JSON.stringify({
      query,
      sort: options.sort,
      limit: options.limit,
      aggregate: options.aggregate
    });
    return crypto.createHash('md5').update(queryString).digest('hex');
  }

  calculateQueryEfficiency(stats) {
    if (!stats.totalDocsExamined || stats.totalDocsExamined === 0) return 1;
    return stats.totalDocsReturned / stats.totalDocsExamined;
  }

  hasCollectionScan(explainResult) {
    const winningPlan = explainResult.queryPlanner?.winningPlan;
    return this.findStageInPlan(winningPlan, 'COLLSCAN') !== null;
  }

  findStageInPlan(plan, stageType) {
    if (!plan) return null;
    if (plan.stage === stageType) return plan;
    
    if (plan.inputStage) {
      return this.findStageInPlan(plan.inputStage, stageType);
    }
    
    if (plan.inputStages) {
      for (const inputStage of plan.inputStages) {
        const found = this.findStageInPlan(inputStage, stageType);
        if (found) return found;
      }
    }
    
    return null;
  }

  extractQueriedFields(query) {
    const fields = [];
    
    function extractFields(obj, prefix = '') {
      for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('$')) continue; // Skip operators
        
        const fullKey = prefix ? `${prefix}.${key}` : key;
        fields.push(fullKey);
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          extractFields(value, fullKey);
        }
      }
    }
    
    extractFields(query);
    return [...new Set(fields)]; // Remove duplicates
  }

  suggestIndex(fields) {
    // Simple heuristic: create compound index with most selective fields first
    return fields.reduce((index, field) => {
      index[field] = 1;
      return index;
    }, {});
  }
}

// Export singleton instance
export const queryOptimizer = new QueryOptimizer();
