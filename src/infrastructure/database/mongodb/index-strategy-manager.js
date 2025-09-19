// src/infrastructure/database/mongodb/index-strategy-manager.js
import { logger } from "#utils/core/logger.js";
import { CacheService } from "#core/cache/services/unified-cache.service.js";
import { queryOptimizer } from "./query-optimizer.js";

/**
 * MongoDB Index Strategy Manager
 * Automated index creation, optimization, and maintenance
 */
export class IndexStrategyManager {
    constructor() {
        this.indexStrategies = new Map();
        this.indexMetrics = new Map();
        this.indexRecommendations = new Map();
        this.optimizationRules = new Map();
        this.monitoringInterval = null;
        this.initializeIndexStrategies();
        this.setupOptimizationRules();
    }

    /**
     * Initialize different index strategies
     */
    initializeIndexStrategies() {
        // Query-based indexing strategy
        this.indexStrategies.set('QUERY_BASED', {
            name: 'Query-based Indexing',
            description: 'Create indexes based on actual query patterns',
            priority: 1,
            analyzer: this.analyzeQueryPatterns.bind(this),
            creator: this.createQueryBasedIndexes.bind(this)
        });

        // Performance-based indexing strategy
        this.indexStrategies.set('PERFORMANCE_BASED', {
            name: 'Performance-based Indexing',
            description: 'Create indexes to optimize slow queries',
            priority: 2,
            analyzer: this.analyzePerformanceBottlenecks.bind(this),
            creator: this.createPerformanceIndexes.bind(this)
        });

        // Schema-based indexing strategy
        this.indexStrategies.set('SCHEMA_BASED', {
            name: 'Schema-based Indexing',
            description: 'Create indexes based on data model analysis',
            priority: 3,
            analyzer: this.analyzeSchemaPatterns.bind(this),
            creator: this.createSchemaBasedIndexes.bind(this)
        });

        // Multi-tenant indexing strategy
        this.indexStrategies.set('MULTI_TENANT', {
            name: 'Multi-tenant Indexing',
            description: 'Create tenant-aware compound indexes',
            priority: 4,
            analyzer: this.analyzeTenantPatterns.bind(this),
            creator: this.createTenantAwareIndexes.bind(this)
        });
    }

    /**
     * Setup optimization rules
     */
    setupOptimizationRules() {
        // Duplicate index rule
        this.optimizationRules.set('REMOVE_DUPLICATES', {
            detect: (indexes) => this.findDuplicateIndexes(indexes),
            optimize: (duplicates) => this.removeDuplicateIndexes(duplicates),
            impact: 'MEDIUM',
            description: 'Remove duplicate or redundant indexes'
        });

        // Unused index rule
        this.optimizationRules.set('REMOVE_UNUSED', {
            detect: (indexes, usage) => this.findUnusedIndexes(indexes, usage),
            optimize: (unused) => this.removeUnusedIndexes(unused),
            impact: 'HIGH',
            description: 'Remove indexes that are never used'
        });

        // Inefficient index rule
        this.optimizationRules.set('OPTIMIZE_INEFFICIENT', {
            detect: (indexes, performance) => this.findInefficientIndexes(indexes, performance),
            optimize: (inefficient) => this.optimizeInefficientIndexes(inefficient),
            impact: 'HIGH',
            description: 'Optimize indexes with poor performance characteristics'
        });

        // Order optimization rule (ESR Rule)
        this.optimizationRules.set('OPTIMIZE_ORDER', {
            detect: (indexes, queries) => this.findSuboptimalOrdering(indexes, queries),
            optimize: (suboptimal) => this.reorderIndexFields(suboptimal),
            impact: 'HIGH',
            description: 'Reorder compound index fields following ESR rule'
        });

        // Partial index rule
        this.optimizationRules.set('CREATE_PARTIAL', {
            detect: (indexes, data) => this.identifyPartialIndexOpportunities(indexes, data),
            optimize: (opportunities) => this.createPartialIndexes(opportunities),
            impact: 'MEDIUM',
            description: 'Create partial indexes to reduce storage and improve performance'
        });

        // Sparse index rule
        this.optimizationRules.set('CREATE_SPARSE', {
            detect: (indexes, data) => this.identifySparseIndexOpportunities(indexes, data),
            optimize: (opportunities) => this.createSparseIndexes(opportunities),
            impact: 'MEDIUM',
            description: 'Create sparse indexes for fields with many null values'
        });
    }

    /**
     * Analyze query patterns to suggest indexes
     */
    async analyzeQueryPatterns(collection, timeWindow = { hours: 24 }) {
        try {
            logger.info(`Analyzing query patterns for collection: ${collection.collectionName}`);

            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - (timeWindow.hours * 60 * 60 * 1000));

            // Collect query statistics from profiler
            const queryStats = await this.collectQueryStatistics(collection, startTime, endTime);

            // Analyze patterns
            const patterns = {
                frequentFields: this.identifyFrequentFields(queryStats),
                sortPatterns: this.identifySortPatterns(queryStats),
                rangeQueries: this.identifyRangeQueries(queryStats),
                compoundQueries: this.identifyCompoundQueries(queryStats),
                aggregationPatterns: this.identifyAggregationPatterns(queryStats)
            };

            // Generate index suggestions
            const suggestions = this.generateIndexSuggestions(patterns);

            return {
                collection: collection.collectionName,
                timeWindow,
                patterns,
                suggestions,
                analyzedAt: new Date()
            };

        } catch (error) {
            logger.error(`Query pattern analysis failed for ${collection.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Analyze performance bottlenecks
     */
    async analyzePerformanceBottlenecks(collection) {
        try {
            const bottlenecks = {
                slowQueries: [],
                collectionScans: [],
                sortWithoutIndex: [],
                largeResultSets: [],
                inefficientIndexes: []
            };

            // Get slow queries from profiler
            const slowQueries = await this.getSlowQueries(collection);

            for (const slowQuery of slowQueries) {
                const explainResult = await queryOptimizer.analyzeQuery(collection, slowQuery.query);

                // Categorize bottlenecks
                if (explainResult.analysis.hasCollectionScan) {
                    bottlenecks.collectionScans.push({
                        query: slowQuery.query,
                        executionTime: slowQuery.executionTime,
                        suggestion: 'Create index on queried fields'
                    });
                }

                if (explainResult.analysis.hasSort && !explainResult.analysis.indexUsage.supportsSorting) {
                    bottlenecks.sortWithoutIndex.push({
                        query: slowQuery.query,
                        sortFields: this.extractSortFields(slowQuery.query),
                        suggestion: 'Create compound index including sort fields'
                    });
                }

                if (explainResult.analysis.totalDocsExamined > 10000) {
                    bottlenecks.largeResultSets.push({
                        query: slowQuery.query,
                        docsExamined: explainResult.analysis.totalDocsExamined,
                        suggestion: 'Add pagination or more selective filters'
                    });
                }

                if (explainResult.analysis.efficiency < 0.1) {
                    bottlenecks.inefficientIndexes.push({
                        query: slowQuery.query,
                        efficiency: explainResult.analysis.efficiency,
                        suggestion: 'Optimize existing indexes or create new ones'
                    });
                }

                bottlenecks.slowQueries.push({
                    query: slowQuery.query,
                    executionTime: slowQuery.executionTime,
                    analysis: explainResult.analysis
                });
            }

            return bottlenecks;

        } catch (error) {
            logger.error(`Performance bottleneck analysis failed:`, error);
            throw error;
        }
    }

    /**
     * Analyze schema patterns for indexing opportunities
     */
    async analyzeSchemaPatterns(collection) {
        try {
            // Sample documents to understand schema
            const sampleSize = 1000;
            const samples = await collection.aggregate([
                { $sample: { size: sampleSize } }
            ]).toArray();

            const schemaAnalysis = {
                fieldFrequency: new Map(),
                dataTypes: new Map(),
                arrayFields: [],
                objectFields: [],
                nullFrequency: new Map(),
                uniquenessScores: new Map()
            };

            // Analyze field patterns
            for (const doc of samples) {
                this.analyzeDocumentFields(doc, schemaAnalysis);
            }

            // Calculate field statistics
            const fieldStats = this.calculateFieldStatistics(schemaAnalysis, samples.length);

            // Generate schema-based index recommendations
            const recommendations = this.generateSchemaBasedRecommendations(fieldStats);

            return {
                collection: collection.collectionName,
                sampleSize,
                fieldStats,
                recommendations,
                analyzedAt: new Date()
            };

        } catch (error) {
            logger.error(`Schema pattern analysis failed:`, error);
            throw error;
        }
    }

    /**
     * Analyze tenant-specific patterns
     */
    async analyzeTenantPatterns(collection) {
        try {
            const tenantPatterns = {
                tenantDistribution: new Map(),
                tenantSpecificQueries: new Map(),
                crossTenantQueries: [],
                hotTenants: []
            };

            // Analyze tenant distribution
            const tenantStats = await collection.aggregate([
                {
                    $group: {
                        _id: '$tenantId',
                        documentCount: { $sum: 1 },
                        avgSize: { $avg: { $bsonSize: '$$ROOT' } }
                    }
                },
                { $sort: { documentCount: -1 } }
            ]).toArray();

            // Identify hot tenants (top 20% by document count)
            const totalDocs = tenantStats.reduce((sum, stat) => sum + stat.documentCount, 0);
            const hotTenantThreshold = totalDocs * 0.8; // Top 20% of tenants
            let cumulativeCount = 0;

            for (const tenantStat of tenantStats) {
                tenantPatterns.tenantDistribution.set(tenantStat._id, {
                    documentCount: tenantStat.documentCount,
                    avgSize: tenantStat.avgSize,
                    percentage: (tenantStat.documentCount / totalDocs) * 100
                });

                cumulativeCount += tenantStat.documentCount;
                if (cumulativeCount <= hotTenantThreshold) {
                    tenantPatterns.hotTenants.push(tenantStat._id);
                }
            }

            // Generate tenant-aware index recommendations
            const recommendations = this.generateTenantAwareRecommendations(tenantPatterns);

            return {
                collection: collection.collectionName,
                tenantPatterns,
                recommendations,
                analyzedAt: new Date()
            };

        } catch (error) {
            logger.error(`Tenant pattern analysis failed:`, error);
            throw error;
        }
    }

    /**
     * Create query-based indexes
     */
    async createQueryBasedIndexes(collection, analysis) {
        const createdIndexes = [];

        try {
            for (const suggestion of analysis.suggestions) {
                if (suggestion.type === 'COMPOUND_INDEX') {
                    const indexSpec = this.buildCompoundIndexSpec(suggestion);
                    const indexName = await collection.createIndex(indexSpec.fields, indexSpec.options);

                    createdIndexes.push({
                        name: indexName,
                        fields: indexSpec.fields,
                        type: 'compound',
                        reason: suggestion.reason,
                        expectedImprovement: suggestion.expectedImprovement
                    });
                } else if (suggestion.type === 'SINGLE_FIELD_INDEX') {
                    const indexSpec = this.buildSingleFieldIndexSpec(suggestion);
                    const indexName = await collection.createIndex(indexSpec.fields, indexSpec.options);

                    createdIndexes.push({
                        name: indexName,
                        fields: indexSpec.fields,
                        type: 'single',
                        reason: suggestion.reason,
                        expectedImprovement: suggestion.expectedImprovement
                    });
                }
            }

            logger.info(`Created ${createdIndexes.length} query-based indexes for ${collection.collectionName}`);
            return createdIndexes;

        } catch (error) {
            logger.error(`Failed to create query-based indexes:`, error);
            throw error;
        }
    }

    /**
     * Create performance-optimized indexes
     */
    async createPerformanceIndexes(collection, bottlenecks) {
        const createdIndexes = [];

        try {
            // Create indexes for collection scans
            for (const bottleneck of bottlenecks.collectionScans) {
                const fields = this.extractQueriedFields(bottleneck.query);
                if (fields.length > 0) {
                    const indexSpec = this.optimizeFieldOrder(fields, bottleneck.query);
                    const indexName = await collection.createIndex(indexSpec, { background: true });

                    createdIndexes.push({
                        name: indexName,
                        fields: indexSpec,
                        type: 'collection_scan_fix',
                        originalExecutionTime: bottleneck.executionTime
                    });
                }
            }

            // Create indexes for sort operations
            for (const bottleneck of bottlenecks.sortWithoutIndex) {
                const combinedFields = this.combineQueryAndSortFields(
                    bottleneck.query,
                    bottleneck.sortFields
                );
                const indexName = await collection.createIndex(combinedFields, { background: true });

                createdIndexes.push({
                    name: indexName,
                    fields: combinedFields,
                    type: 'sort_optimization',
                    sortFields: bottleneck.sortFields
                });
            }

            logger.info(`Created ${createdIndexes.length} performance indexes for ${collection.collectionName}`);
            return createdIndexes;

        } catch (error) {
            logger.error(`Failed to create performance indexes:`, error);
            throw error;
        }
    }

    /**
     * Create schema-based indexes
     */
    async createSchemaBasedIndexes(collection, analysis) {
        const createdIndexes = [];

        try {
            for (const recommendation of analysis.recommendations) {
                const indexSpec = this.buildSchemaIndexSpec(recommendation);
                const indexName = await collection.createIndex(
                    indexSpec.fields,
                    {
                        ...indexSpec.options,
                        background: true
                    }
                );

                createdIndexes.push({
                    name: indexName,
                    fields: indexSpec.fields,
                    options: indexSpec.options,
                    type: recommendation.type,
                    reason: recommendation.reason
                });
            }

            logger.info(`Created ${createdIndexes.length} schema-based indexes for ${collection.collectionName}`);
            return createdIndexes;

        } catch (error) {
            logger.error(`Failed to create schema-based indexes:`, error);
            throw error;
        }
    }

    /**
     * Create tenant-aware indexes
     */
    async createTenantAwareIndexes(collection, analysis) {
        const createdIndexes = [];

        try {
            // Create tenant-prefixed compound indexes
            const tenantCompoundIndexes = [
                { tenantId: 1, createdAt: -1 }, // Most common pattern
                { tenantId: 1, updatedAt: -1 },
                { tenantId: 1, status: 1 },
                { tenantId: 1, userId: 1 }
            ];

            for (const indexFields of tenantCompoundIndexes) {
                try {
                    const indexName = await collection.createIndex(indexFields, {
                        background: true,
                        name: `tenant_${Object.keys(indexFields).join('_')}_idx`
                    });

                    createdIndexes.push({
                        name: indexName,
                        fields: indexFields,
                        type: 'tenant_compound',
                        reason: 'Multi-tenant query optimization'
                    });
                } catch (error) {
                    // Index might already exist
                    if (!error.message.includes('already exists')) {
                        logger.warn(`Failed to create tenant index: ${error.message}`);
                    }
                }
            }

            // Create indexes for hot tenants
            for (const hotTenant of analysis.tenantPatterns.hotTenants.slice(0, 5)) {
                const partialIndexSpec = {
                    createdAt: -1,
                    status: 1
                };

                try {
                    const indexName = await collection.createIndex(partialIndexSpec, {
                        background: true,
                        partialFilterExpression: { tenantId: hotTenant },
                        name: `hot_tenant_${hotTenant}_idx`
                    });

                    createdIndexes.push({
                        name: indexName,
                        fields: partialIndexSpec,
                        type: 'hot_tenant_partial',
                        tenantId: hotTenant,
                        reason: 'Hot tenant optimization'
                    });
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        logger.warn(`Failed to create hot tenant index: ${error.message}`);
                    }
                }
            }

            logger.info(`Created ${createdIndexes.length} tenant-aware indexes for ${collection.collectionName}`);
            return createdIndexes;

        } catch (error) {
            logger.error(`Failed to create tenant-aware indexes:`, error);
            throw error;
        }
    }

    /**
     * Execute comprehensive index optimization
     */
    async executeIndexOptimization(collection, strategies = ['QUERY_BASED', 'PERFORMANCE_BASED']) {
        try {
            logger.info(`Starting index optimization for ${collection.collectionName}`);

            const optimizationResults = {
                collection: collection.collectionName,
                strategiesApplied: strategies,
                createdIndexes: [],
                removedIndexes: [],
                optimizedIndexes: [],
                performance: {
                    before: {},
                    after: {}
                },
                startedAt: new Date()
            };

            // Capture baseline performance
            optimizationResults.performance.before = await this.capturePerformanceBaseline(collection);

            // Apply each strategy
            for (const strategyName of strategies) {
                const strategy = this.indexStrategies.get(strategyName);
                if (!strategy) {
                    logger.warn(`Unknown strategy: ${strategyName}`);
                    continue;
                }

                logger.info(`Applying strategy: ${strategy.name}`);

                // Analyze using strategy
                const analysis = await strategy.analyzer(collection);

                // Create indexes based on analysis
                const createdIndexes = await strategy.creator(collection, analysis);
                optimizationResults.createdIndexes.push(...createdIndexes);
            }

            // Apply optimization rules
            await this.applyOptimizationRules(collection, optimizationResults);

            // Capture post-optimization performance
            optimizationResults.performance.after = await this.capturePerformanceBaseline(collection);

            // Calculate improvement
            optimizationResults.improvement = this.calculatePerformanceImprovement(
                optimizationResults.performance.before,
                optimizationResults.performance.after
            );

            optimizationResults.completedAt = new Date();
            optimizationResults.duration = optimizationResults.completedAt - optimizationResults.startedAt;

            logger.info(`Index optimization completed for ${collection.collectionName}`, {
                createdIndexes: optimizationResults.createdIndexes.length,
                removedIndexes: optimizationResults.removedIndexes.length,
                duration: optimizationResults.duration
            });

            return optimizationResults;

        } catch (error) {
            logger.error(`Index optimization failed for ${collection.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Apply optimization rules
     */
    async applyOptimizationRules(collection, optimizationResults) {
        try {
            // Get current indexes
            const currentIndexes = await this.getCurrentIndexes(collection);

            // Get index usage statistics
            const indexUsage = await this.getIndexUsageStats(collection);

            // Apply each optimization rule
            for (const [ruleName, rule] of this.optimizationRules) {
                try {
                    const detectedIssues = rule.detect(currentIndexes, indexUsage);

                    if (detectedIssues && detectedIssues.length > 0) {
                        logger.info(`Applying optimization rule: ${ruleName}`);
                        const optimized = await rule.optimize(detectedIssues);

                        if (ruleName.includes('REMOVE')) {
                            optimizationResults.removedIndexes.push(...optimized);
                        } else {
                            optimizationResults.optimizedIndexes.push(...optimized);
                        }
                    }
                } catch (error) {
                    logger.warn(`Failed to apply optimization rule ${ruleName}:`, error.message);
                }
            }

        } catch (error) {
            logger.error(`Failed to apply optimization rules:`, error);
        }
    }

    /**
     * Find duplicate indexes
     */
    findDuplicateIndexes(indexes) {
        const duplicates = [];
        const indexMap = new Map();

        for (const index of indexes) {
            const keySignature = JSON.stringify(index.key);

            if (indexMap.has(keySignature)) {
                duplicates.push({
                    original: indexMap.get(keySignature),
                    duplicate: index,
                    reason: 'Identical key specification'
                });
            } else {
                indexMap.set(keySignature, index);
            }
        }

        return duplicates;
    }

    /**
     * Find unused indexes
     */
    findUnusedIndexes(indexes, usage) {
        const unused = [];
        const usageMap = new Map(usage.map(u => [u.name, u]));

        for (const index of indexes) {
            if (index.name === '_id_') continue; // Skip default index

            const indexUsage = usageMap.get(index.name);
            if (!indexUsage || indexUsage.ops < 10) { // Less than 10 operations
                unused.push({
                    index,
                    usage: indexUsage?.ops || 0,
                    reason: 'Index rarely or never used'
                });
            }
        }

        return unused;
    }

    /**
     * Find inefficient indexes
     */
    findInefficientIndexes(indexes, performance) {
        const inefficient = [];

        for (const index of indexes) {
            const indexPerf = performance.find(p => p.indexName === index.name);

            if (indexPerf) {
                // Check selectivity
                if (indexPerf.selectivity < 0.1) {
                    inefficient.push({
                        index,
                        issue: 'Low selectivity',
                        selectivity: indexPerf.selectivity,
                        reason: 'Index filters too few documents'
                    });
                }

                // Check hit ratio
                if (indexPerf.hitRatio < 0.5) {
                    inefficient.push({
                        index,
                        issue: 'Low hit ratio',
                        hitRatio: indexPerf.hitRatio,
                        reason: 'Index not effectively used by queries'
                    });
                }
            }
        }

        return inefficient;
    }

    /**
     * Generate index recommendations report
     */
    async generateIndexRecommendationsReport(collections) {
        const report = {
            generatedAt: new Date(),
            collections: [],
            summary: {
                totalCollections: collections.length,
                totalRecommendations: 0,
                highPriorityRecommendations: 0,
                estimatedPerformanceGain: 0
            }
        };

        for (const collection of collections) {
            try {
                const collectionReport = {
                    name: collection.collectionName,
                    currentIndexes: await this.getCurrentIndexes(collection),
                    recommendations: [],
                    analysis: {}
                };

                // Analyze with all strategies
                for (const [strategyName, strategy] of this.indexStrategies) {
                    const analysis = await strategy.analyzer(collection);
                    collectionReport.analysis[strategyName] = analysis;

                    if (analysis.suggestions) {
                        collectionReport.recommendations.push(...analysis.suggestions);
                    }
                    if (analysis.recommendations) {
                        collectionReport.recommendations.push(...analysis.recommendations);
                    }
                }

                // Prioritize recommendations
                collectionReport.recommendations = this.prioritizeRecommendations(
                    collectionReport.recommendations
                );

                report.collections.push(collectionReport);
                report.summary.totalRecommendations += collectionReport.recommendations.length;
                report.summary.highPriorityRecommendations += collectionReport.recommendations
                    .filter(r => r.priority === 'HIGH').length;

            } catch (error) {
                logger.error(`Failed to analyze collection ${collection.collectionName}:`, error);
            }
        }

        return report;
    }

    /**
     * Start automated index monitoring
     */
    startIndexMonitoring(collections, intervalMinutes = 60) {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        this.monitoringInterval = setInterval(async () => {
            try {
                await this.performIndexHealthCheck(collections);
            } catch (error) {
                logger.error('Index monitoring failed:', error);
            }
        }, intervalMinutes * 60 * 1000);

        logger.info(`Index monitoring started for ${collections.length} collections`);
    }

    /**
     * Perform index health check
     */
    async performIndexHealthCheck(collections) {
        for (const collection of collections) {
            try {
                const health = await this.checkIndexHealth(collection);

                if (health.issues.length > 0) {
                    logger.warn(`Index health issues detected for ${collection.collectionName}:`, health.issues);

                    // Auto-fix if enabled
                    if (process.env.AUTO_INDEX_OPTIMIZATION === 'true') {
                        await this.autoFixIndexIssues(collection, health.issues);
                    }
                }

            } catch (error) {
                logger.error(`Index health check failed for ${collection.collectionName}:`, error);
            }
        }
    }

    // Helper methods
    buildCompoundIndexSpec(suggestion) {
        const fields = {};

        // Apply ESR rule: Equality, Sort, Range
        const equalityFields = suggestion.fields.filter(f => f.type === 'equality');
        const sortFields = suggestion.fields.filter(f => f.type === 'sort');
        const rangeFields = suggestion.fields.filter(f => f.type === 'range');

        // Add equality fields first
        equalityFields.forEach(field => {
            fields[field.name] = 1;
        });

        // Add sort fields
        sortFields.forEach(field => {
            fields[field.name] = field.direction || 1;
        });

        // Add range fields last
        rangeFields.forEach(field => {
            fields[field.name] = 1;
        });

        return {
            fields,
            options: {
                background: true,
                name: suggestion.name || `compound_${Object.keys(fields).join('_')}_idx`
            }
        };
    }

    extractQueriedFields(query) {
        const fields = [];

        const extractFromObject = (obj, prefix = '') => {
            for (const [key, value] of Object.entries(obj)) {
                if (key.startsWith('$')) continue;

                const fieldName = prefix ? `${prefix}.${key}` : key;
                fields.push(fieldName);

                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    extractFromObject(value, fieldName);
                }
            }
        };

        extractFromObject(query);
        return [...new Set(fields)];
    }

    optimizeFieldOrder(fields, query) {
        // Simple heuristic: put most selective fields first
        // In a real implementation, this would analyze query patterns
        const indexSpec = {};

        fields.sort().forEach(field => {
            indexSpec[field] = 1;
        });

        return indexSpec;
    }

    prioritizeRecommendations(recommendations) {
        return recommendations.sort((a, b) => {
            const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    async getCurrentIndexes(collection) {
        return await collection.listIndexes().toArray();
    }

    async getIndexUsageStats(collection) {
        try {
            return await collection.aggregate([{ $indexStats: {} }]).toArray();
        } catch (error) {
            logger.warn('Failed to get index usage stats:', error.message);
            return [];
        }
    }
}

// Export singleton instance
export const indexStrategyManager = new IndexStrategyManager();

