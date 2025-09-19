// src/infrastructure/optimization/aws-services-optimizer.js
import AWS from "aws-sdk";
import { logger } from "#utils/core/logger.js";

/**
 * AWS Services Optimization Manager
 * Optimizes CloudFront, ElastiCache, and other AWS services
 */
export class AWSServicesOptimizer {
    constructor() {
        this.cloudFront = new AWS.CloudFront({ region: 'us-east-1' }); // CloudFront is global
        this.elastiCache = new AWS.ElastiCache({ region: process.env.AWS_REGION });
        this.cloudWatch = new AWS.CloudWatch({ region: process.env.AWS_REGION });
        this.s3 = new AWS.S3({ region: process.env.AWS_REGION });

        this.optimizationStrategies = new Map();
        this.performanceMetrics = new Map();
        this.initializeOptimizationStrategies();
    }

    /**
     * Initialize AWS optimization strategies
     */
    initializeOptimizationStrategies() {
        // CloudFront optimization strategy
        this.addStrategy('CLOUDFRONT_OPTIMIZATION', {
            name: 'CloudFront Distribution Optimization',
            execute: this.optimizeCloudFront.bind(this),
            priority: 1
        });

        // ElastiCache optimization strategy
        this.addStrategy('ELASTICACHE_OPTIMIZATION', {
            name: 'ElastiCache Cluster Optimization',
            execute: this.optimizeElastiCache.bind(this),
            priority: 2
        });

        // S3 optimization strategy
        this.addStrategy('S3_OPTIMIZATION', {
            name: 'S3 Storage Optimization',
            execute: this.optimizeS3Storage.bind(this),
            priority: 3
        });
    }

    /**
     * Create and optimize CloudFront distribution
     */
    async createOptimizedCloudFrontDistribution(config) {
        try {
            logger.info('Creating optimized CloudFront distribution');

            const distributionConfig = {
                CallerReference: `school-erp-${Date.now()}`,
                Comment: 'School ERP SaaS - Optimized Distribution',
                DefaultRootObject: 'index.html',
                Enabled: true,
                PriceClass: config.priceClass || 'PriceClass_100', // Use only cheapest edge locations

                // Origins configuration
                Origins: {
                    Quantity: 2,
                    Items: [
                        {
                            Id: 'school-erp-api-origin',
                            DomainName: config.apiOriginDomain,
                            CustomOriginConfig: {
                                HTTPPort: 80,
                                HTTPSPort: 443,
                                OriginProtocolPolicy: 'https-only',
                                OriginSslProtocols: {
                                    Quantity: 3,
                                    Items: ['TLSv1.2', 'TLSv1.1', 'TLSv1']
                                },
                                OriginReadTimeout: 30,
                                OriginKeepaliveTimeout: 5
                            }
                        },
                        {
                            Id: 'school-erp-static-origin',
                            DomainName: config.staticOriginDomain,
                            S3OriginConfig: {
                                OriginAccessIdentity: `origin-access-identity/cloudfront/${config.oaiId}`
                            }
                        }
                    ]
                },

                // Default cache behavior
                DefaultCacheBehavior: {
                    TargetOriginId: 'school-erp-api-origin',
                    ViewerProtocolPolicy: 'redirect-to-https',
                    MinTTL: 0,
                    DefaultTTL: 300, // 5 minutes
                    MaxTTL: 31536000, // 1 year
                    Compress: true,

                    ForwardedValues: {
                        QueryString: true,
                        Cookies: {
                            Forward: 'whitelist',
                            WhitelistedNames: {
                                Quantity: 2,
                                Items: ['sessionId', 'tenantId']
                            }
                        },
                        Headers: {
                            Quantity: 5,
                            Items: [
                                'Authorization',
                                'Content-Type',
                                'Accept',
                                'X-Tenant-ID',
                                'CloudFront-Viewer-Country'
                            ]
                        }
                    },

                    TrustedSigners: {
                        Enabled: false,
                        Quantity: 0
                    },

                    AllowedMethods: {
                        Quantity: 7,
                        Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
                        CachedMethods: {
                            Quantity: 2,
                            Items: ['GET', 'HEAD']
                        }
                    },

                    SmoothStreaming: false
                },

                // Cache behaviors for different content types
                CacheBehaviors: {
                    Quantity: 4,
                    Items: [
                        // Static assets caching
                        {
                            PathPattern: '/static/*',
                            TargetOriginId: 'school-erp-static-origin',
                            ViewerProtocolPolicy: 'redirect-to-https',
                            MinTTL: 86400, // 1 day
                            DefaultTTL: 31536000, // 1 year
                            MaxTTL: 31536000, // 1 year
                            Compress: true,

                            ForwardedValues: {
                                QueryString: false,
                                Cookies: { Forward: 'none' },
                                Headers: {
                                    Quantity: 2,
                                    Items: ['Accept-Encoding', 'Origin']
                                }
                            },

                            TrustedSigners: {
                                Enabled: false,
                                Quantity: 0
                            },

                            AllowedMethods: {
                                Quantity: 2,
                                Items: ['GET', 'HEAD'],
                                CachedMethods: {
                                    Quantity: 2,
                                    Items: ['GET', 'HEAD']
                                }
                            }
                        },

                        // API responses (short cache)
                        {
                            PathPattern: '/api/v1/public/*',
                            TargetOriginId: 'school-erp-api-origin',
                            ViewerProtocolPolicy: 'https-only',
                            MinTTL: 0,
                            DefaultTTL: 60, // 1 minute
                            MaxTTL: 300, // 5 minutes
                            Compress: true,

                            ForwardedValues: {
                                QueryString: true,
                                Cookies: { Forward: 'all' },
                                Headers: {
                                    Quantity: 6,
                                    Items: [
                                        'Authorization',
                                        'Content-Type',
                                        'Accept',
                                        'X-Tenant-ID',
                                        'User-Agent',
                                        'CloudFront-Viewer-Country'
                                    ]
                                }
                            },

                            AllowedMethods: {
                                Quantity: 7,
                                Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE']
                            }
                        },

                        // Private API (no caching)
                        {
                            PathPattern: '/api/v1/private/*',
                            TargetOriginId: 'school-erp-api-origin',
                            ViewerProtocolPolicy: 'https-only',
                            MinTTL: 0,
                            DefaultTTL: 0,
                            MaxTTL: 0,
                            Compress: true,

                            ForwardedValues: {
                                QueryString: true,
                                Cookies: { Forward: 'all' },
                                Headers: { Quantity: 1, Items: ['*'] }
                            },

                            AllowedMethods: {
                                Quantity: 7,
                                Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE']
                            }
                        },

                        // Authentication endpoints (no caching)
                        {
                            PathPattern: '/auth/*',
                            TargetOriginId: 'school-erp-api-origin',
                            ViewerProtocolPolicy: 'https-only',
                            MinTTL: 0,
                            DefaultTTL: 0,
                            MaxTTL: 0,
                            Compress: false,

                            ForwardedValues: {
                                QueryString: true,
                                Cookies: { Forward: 'all' },
                                Headers: { Quantity: 1, Items: ['*'] }
                            },

                            AllowedMethods: {
                                Quantity: 7,
                                Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE']
                            }
                        }
                    ]
                },

                // Error pages
                CustomErrorResponses: {
                    Quantity: 3,
                    Items: [
                        {
                            ErrorCode: 404,
                            ResponsePagePath: '/404.html',
                            ResponseCode: '404',
                            ErrorCachingMinTTL: 300
                        },
                        {
                            ErrorCode: 500,
                            ResponsePagePath: '/500.html',
                            ResponseCode: '500',
                            ErrorCachingMinTTL: 0
                        },
                        {
                            ErrorCode: 503,
                            ResponsePagePath: '/maintenance.html',
                            ResponseCode: '503',
                            ErrorCachingMinTTL: 0
                        }
                    ]
                },

                // Geographic restrictions
                Restrictions: {
                    GeoRestriction: {
                        RestrictionType: 'none'
                    }
                },

                // SSL/TLS configuration
                ViewerCertificate: {
                    ACMCertificateArn: config.certificateArn,
                    SSLSupportMethod: 'sni-only',
                    MinimumProtocolVersion: 'TLSv1.2_2021'
                },

                // Logging configuration
                Logging: {
                    Enabled: true,
                    IncludeCookies: false,
                    Bucket: `${config.logsBucket}.s3.amazonaws.com`,
                    Prefix: 'cloudfront-logs/'
                },

                // Web ACL for security
                WebACLId: config.webAclId || ''
            };

            const result = await this.cloudFront.createDistribution({
                DistributionConfig: distributionConfig
            }).promise();

            const distributionId = result.Distribution.Id;

            // Configure additional optimizations
            await this.configureCloudFrontOptimizations(distributionId);

            logger.info(`Optimized CloudFront distribution created: ${distributionId}`);
            return result;

        } catch (error) {
            logger.error('Failed to create optimized CloudFront distribution:', error);
            throw error;
        }
    }

    /**
     * Configure additional CloudFront optimizations
     */
    async configureCloudFrontOptimizations(distributionId) {
        try {
            // Create CloudWatch alarms for monitoring
            await this.createCloudFrontAlarms(distributionId);

            // Set up real-time logs (if needed)
            // await this.configureCloudFrontRealTimeLogs(distributionId);

            logger.info(`CloudFront optimizations configured for: ${distributionId}`);

        } catch (error) {
            logger.error('Failed to configure CloudFront optimizations:', error);
        }
    }

    /**
     * Create optimized ElastiCache cluster
     */
    async createOptimizedElastiCacheCluster(config) {
        try {
            logger.info('Creating optimized ElastiCache cluster');

            // Create subnet group
            const subnetGroupName = `${config.clusterName}-subnet-group`;
            await this.elastiCache.createCacheSubnetGroup({
                CacheSubnetGroupName: subnetGroupName,
                CacheSubnetGroupDescription: 'Subnet group for School ERP ElastiCache',
                SubnetIds: config.subnetIds
            }).promise();

            // Create parameter group for optimization
            const parameterGroupName = `${config.clusterName}-params`;
            await this.createOptimizedParameterGroup(parameterGroupName, config.engine);

            // Create the cluster
            const clusterConfig = {
                CacheClusterId: config.clusterName,
                Engine: config.engine || 'redis',
                EngineVersion: config.engineVersion || '6.2',
                CacheNodeType: config.nodeType || 'cache.r6g.large',
                NumCacheNodes: config.numNodes || 1,

                // Performance optimizations
                CacheParameterGroupName: parameterGroupName,
                CacheSubnetGroupName: subnetGroupName,
                SecurityGroupIds: config.securityGroupIds,

                // High availability
                PreferredAvailabilityZone: config.availabilityZone,
                PreferredMaintenanceWindow: 'sun:03:00-sun:04:00',

                // Backup and recovery
                SnapshotRetentionLimit: 7,
                SnapshotWindow: '02:00-03:00',

                // Notifications
                NotificationTopicArn: config.notificationTopicArn,

                // Security
                AtRestEncryptionEnabled: true,
                TransitEncryptionEnabled: true,
                AuthToken: config.authToken,

                // Logging
                LogDeliveryConfigurations: [
                    {
                        DestinationType: 'cloudwatch-logs',
                        DestinationDetails: {
                            CloudWatchLogsDetails: {
                                LogGroup: `/aws/elasticache/${config.clusterName}`
                            }
                        },
                        LogFormat: 'json',
                        LogType: 'slow-log'
                    }
                ],

                Tags: [
                    {
                        Key: 'Environment',
                        Value: process.env.NODE_ENV || 'production'
                    },
                    {
                        Key: 'Application',
                        Value: 'school-erp-saas'
                    },
                    {
                        Key: 'ManagedBy',
                        Value: 'aws-services-optimizer'
                    }
                ]
            };

            const result = await this.elastiCache.createCacheCluster(clusterConfig).promise();

            // Configure monitoring and alarms
            await this.configureElastiCacheMonitoring(config.clusterName);

            logger.info(`Optimized ElastiCache cluster created: ${config.clusterName}`);
            return result;

        } catch (error) {
            logger.error('Failed to create optimized ElastiCache cluster:', error);
            throw error;
        }
    }

    /**
     * Create optimized parameter group for ElastiCache
     */
    async createOptimizedParameterGroup(parameterGroupName, engine) {
        try {
            // Create parameter group
            await this.elastiCache.createCacheParameterGroup({
                CacheParameterGroupName: parameterGroupName,
                CacheParameterGroupFamily: engine === 'redis' ? 'redis6.x' : 'memcached1.6',
                Description: 'Optimized parameters for School ERP ElastiCache'
            }).promise();

            // Configure optimized parameters for Redis
            if (engine === 'redis') {
                await this.elastiCache.modifyCacheParameterGroup({
                    CacheParameterGroupName: parameterGroupName,
                    ParameterNameValues: [
                        {
                            ParameterName: 'maxmemory-policy',
                            ParameterValue: 'allkeys-lru'
                        },
                        {
                            ParameterName: 'timeout',
                            ParameterValue: '300'
                        },
                        {
                            ParameterName: 'tcp-keepalive',
                            ParameterValue: '60'
                        },
                        {
                            ParameterName: 'maxclients',
                            ParameterValue: '10000'
                        }
                    ]
                }).promise();
            }

            logger.info(`Optimized parameter group created: ${parameterGroupName}`);

        } catch (error) {
            if (!error.code || error.code !== 'CacheParameterGroupAlreadyExists') {
                logger.error('Failed to create parameter group:', error);
                throw error;
            }
        }
    }

    /**
     * Configure ElastiCache monitoring and alarms
     */
    async configureElastiCacheMonitoring(clusterName) {
        const alarmConfigs = [
            {
                AlarmName: `${clusterName}-high-cpu`,
                MetricName: 'CPUUtilization',
                Threshold: 80,
                ComparisonOperator: 'GreaterThanThreshold'
            },
            {
                AlarmName: `${clusterName}-high-memory`,
                MetricName: 'DatabaseMemoryUsagePercentage',
                Threshold: 85,
                ComparisonOperator: 'GreaterThanThreshold'
            },
            {
                AlarmName: `${clusterName}-high-connections`,
                MetricName: 'CurrConnections',
                Threshold: 500,
                ComparisonOperator: 'GreaterThanThreshold'
            },
            {
                AlarmName: `${clusterName}-cache-hits-low`,
                MetricName: 'CacheHitRate',
                Threshold: 80,
                ComparisonOperator: 'LessThanThreshold'
            }
        ];

        for (const alarmConfig of alarmConfigs) {
            await this.cloudWatch.putMetricAlarm({
                AlarmName: alarmConfig.AlarmName,
                AlarmDescription: `ElastiCache alarm for ${clusterName}`,
                MetricName: alarmConfig.MetricName,
                Namespace: 'AWS/ElastiCache',
                Statistic: 'Average',
                Period: 300,
                EvaluationPeriods: 2,
                Threshold: alarmConfig.Threshold,
                ComparisonOperator: alarmConfig.ComparisonOperator,
                Dimensions: [
                    {
                        Name: 'CacheClusterId',
                        Value: clusterName
                    }
                ],
                AlarmActions: [
                    process.env.SNS_ALARM_TOPIC_ARN
                ]
            }).promise();
        }

        logger.info(`ElastiCache monitoring configured for: ${clusterName}`);
    }

    /**
     * Optimize S3 storage for the application
     */
    async optimizeS3Storage(bucketName) {
        try {
            logger.info(`Optimizing S3 storage: ${bucketName}`);

            // Configure lifecycle policies
            await this.s3.putBucketLifecycleConfiguration({
                Bucket: bucketName,
                LifecycleConfiguration: {
                    Rules: [
                        {
                            Id: 'OptimizeStorageClass',
                            Status: 'Enabled',
                            Filter: {
                                Prefix: 'uploads/'
                            },
                            Transitions: [
                                {
                                    Days: 30,
                                    StorageClass: 'STANDARD_IA'
                                },
                                {
                                    Days: 90,
                                    StorageClass: 'GLACIER'
                                },
                                {
                                    Days: 365,
                                    StorageClass: 'DEEP_ARCHIVE'
                                }
                            ]
                        },
                        {
                            Id: 'DeleteOldVersions',
                            Status: 'Enabled',
                            NoncurrentVersionTransitions: [
                                {
                                    NoncurrentDays: 30,
                                    StorageClass: 'STANDARD_IA'
                                }
                            ],
                            NoncurrentVersionExpiration: {
                                NoncurrentDays: 90
                            }
                        },
                        {
                            Id: 'DeleteIncompleteMultipartUploads',
                            Status: 'Enabled',
                            AbortIncompleteMultipartUpload: {
                                DaysAfterInitiation: 7
                            }
                        }
                    ]
                }
            }).promise();

            // Configure intelligent tiering
            await this.s3.putBucketIntelligentTieringConfiguration({
                Bucket: bucketName,
                Id: 'SchoolERPIntelligentTiering',
                IntelligentTieringConfiguration: {
                    Id: 'SchoolERPIntelligentTiering',
                    Status: 'Enabled',
                    Filter: {
                        Prefix: 'documents/'
                    },
                    OptionalFields: [
                        'BucketKeyStatus'
                    ]
                }
            }).promise();

            // Configure request metrics
            await this.s3.putBucketMetricsConfiguration({
                Bucket: bucketName,
                Id: 'SchoolERPMetrics',
                MetricsConfiguration: {
                    Id: 'SchoolERPMetrics',
                    Filter: {
                        Prefix: 'api-logs/'
                    }
                }
            }).promise();

            logger.info(`S3 storage optimized: ${bucketName}`);

        } catch (error) {
            logger.error(`Failed to optimize S3 storage ${bucketName}:`, error);
            throw error;
        }
    }

    /**
     * Monitor AWS services performance
     */
    async monitorAWSServicesPerformance() {
        setInterval(async () => {
            try {
                await this.collectCloudFrontMetrics();
                await this.collectElastiCacheMetrics();
                await this.analyzeAWSPerformance();
                await this.generateOptimizationRecommendations();
            } catch (error) {
                logger.error('AWS services monitoring failed:', error);
            }
        }, 300000); // Every 5 minutes

        logger.info('AWS services performance monitoring started');
    }

    // src/infrastructure/optimization/aws-services-optimizer.js (continued)

    /**
     * Collect CloudFront metrics
     */
    async collectCloudFrontMetrics() {
        try {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 300000); // Last 5 minutes

            const metricsToCollect = [
                'Requests',
                'BytesDownloaded',
                'BytesUploaded',
                '4xxErrorRate',
                '5xxErrorRate',
                'OriginLatency'
            ];

            for (const metricName of metricsToCollect) {
                try {
                    const params = {
                        Namespace: 'AWS/CloudFront',
                        MetricName: metricName,
                        StartTime: startTime,
                        EndTime: endTime,
                        Period: 300,
                        Statistics: ['Sum', 'Average', 'Maximum']
                    };

                    const result = await this.cloudWatch.getMetricStatistics(params).promise();
                    this.performanceMetrics.set(`cloudfront:${metricName}`, result.Datapoints);

                } catch (error) {
                    logger.warn(`Failed to collect CloudFront metric ${metricName}:`, error.message);
                }
            }

            logger.debug('CloudFront metrics collected successfully');

        } catch (error) {
            logger.error('Failed to collect CloudFront metrics:', error);
        }
    }

    /**
     * Collect ElastiCache metrics
     */
    async collectElastiCacheMetrics() {
        try {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 300000); // Last 5 minutes

            // Get all ElastiCache clusters
            const clusters = await this.elastiCache.describeCacheClusters().promise();

            for (const cluster of clusters.CacheClusters) {
                const clusterMetrics = [
                    'CPUUtilization',
                    'DatabaseMemoryUsagePercentage',
                    'NetworkBytesIn',
                    'NetworkBytesOut',
                    'CurrConnections',
                    'CacheHitRate',
                    'CacheMissRate',
                    'Evictions',
                    'CommandConfigSet',
                    'CommandConfigGet'
                ];

                for (const metricName of clusterMetrics) {
                    try {
                        const params = {
                            Namespace: 'AWS/ElastiCache',
                            MetricName: metricName,
                            Dimensions: [
                                {
                                    Name: 'CacheClusterId',
                                    Value: cluster.CacheClusterId
                                }
                            ],
                            StartTime: startTime,
                            EndTime: endTime,
                            Period: 300,
                            Statistics: ['Average', 'Maximum']
                        };

                        const result = await this.cloudWatch.getMetricStatistics(params).promise();
                        this.performanceMetrics.set(
                            `elasticache:${cluster.CacheClusterId}:${metricName}`,
                            result.Datapoints
                        );

                    } catch (error) {
                        logger.warn(`Failed to collect ElastiCache metric ${metricName} for ${cluster.CacheClusterId}:`, error.message);
                    }
                }
            }

            logger.debug('ElastiCache metrics collected successfully');

        } catch (error) {
            logger.error('Failed to collect ElastiCache metrics:', error);
        }
    }

    /**
     * Analyze AWS services performance
     */
    async analyzeAWSPerformance() {
        const analysis = {
            cloudfront: {
                totalRequests: 0,
                errorRate: 0,
                cacheHitRatio: 0,
                averageLatency: 0,
                issues: []
            },
            elasticache: {
                clusters: {},
                overallHealth: 'healthy',
                issues: []
            },
            recommendations: []
        };

        try {
            // Analyze CloudFront performance
            const cfRequests = this.performanceMetrics.get('cloudfront:Requests') || [];
            const cf4xxErrors = this.performanceMetrics.get('cloudfront:4xxErrorRate') || [];
            const cf5xxErrors = this.performanceMetrics.get('cloudfront:5xxErrorRate') || [];
            const cfLatency = this.performanceMetrics.get('cloudfront:OriginLatency') || [];

            if (cfRequests.length > 0) {
                analysis.cloudfront.totalRequests = cfRequests.reduce((sum, point) => sum + point.Sum, 0);
            }

            if (cf4xxErrors.length > 0 || cf5xxErrors.length > 0) {
                const total4xx = cf4xxErrors.reduce((sum, point) => sum + point.Average, 0);
                const total5xx = cf5xxErrors.reduce((sum, point) => sum + point.Average, 0);
                analysis.cloudfront.errorRate = ((total4xx + total5xx) / cfRequests.length) * 100;

                if (analysis.cloudfront.errorRate > 5) {
                    analysis.cloudfront.issues.push({
                        type: 'HIGH_ERROR_RATE',
                        value: analysis.cloudfront.errorRate,
                        threshold: 5,
                        severity: 'HIGH'
                    });
                }
            }

            if (cfLatency.length > 0) {
                analysis.cloudfront.averageLatency = cfLatency.reduce((sum, point) => sum + point.Average, 0) / cfLatency.length;

                if (analysis.cloudfront.averageLatency > 1000) { // 1 second
                    analysis.cloudfront.issues.push({
                        type: 'HIGH_LATENCY',
                        value: analysis.cloudfront.averageLatency,
                        threshold: 1000,
                        severity: 'MEDIUM'
                    });
                }
            }

            // Analyze ElastiCache performance
            for (const [key, datapoints] of this.performanceMetrics) {
                if (key.startsWith('elasticache:')) {
                    const [, clusterId, metricName] = key.split(':');

                    if (!analysis.elasticache.clusters[clusterId]) {
                        analysis.elasticache.clusters[clusterId] = {
                            health: 'healthy',
                            metrics: {},
                            issues: []
                        };
                    }

                    const cluster = analysis.elasticache.clusters[clusterId];

                    if (datapoints.length > 0) {
                        const avgValue = datapoints.reduce((sum, point) => sum + point.Average, 0) / datapoints.length;
                        cluster.metrics[metricName] = avgValue;

                        // Check for performance issues
                        switch (metricName) {
                            case 'CPUUtilization':
                                if (avgValue > 80) {
                                    cluster.issues.push({
                                        type: 'HIGH_CPU',
                                        value: avgValue,
                                        threshold: 80,
                                        severity: 'HIGH'
                                    });
                                    cluster.health = 'warning';
                                }
                                break;

                            case 'DatabaseMemoryUsagePercentage':
                                if (avgValue > 90) {
                                    cluster.issues.push({
                                        type: 'HIGH_MEMORY',
                                        value: avgValue,
                                        threshold: 90,
                                        severity: 'CRITICAL'
                                    });
                                    cluster.health = 'critical';
                                }
                                break;

                            case 'CacheHitRate':
                                if (avgValue < 80) {
                                    cluster.issues.push({
                                        type: 'LOW_CACHE_HIT_RATE',
                                        value: avgValue,
                                        threshold: 80,
                                        severity: 'MEDIUM'
                                    });
                                    cluster.health = 'warning';
                                }
                                break;

                            case 'Evictions':
                                if (avgValue > 100) { // More than 100 evictions per 5 minutes
                                    cluster.issues.push({
                                        type: 'HIGH_EVICTIONS',
                                        value: avgValue,
                                        threshold: 100,
                                        severity: 'HIGH'
                                    });
                                    cluster.health = 'warning';
                                }
                                break;
                        }
                    }
                }
            }

            // Determine overall ElastiCache health
            const clusterHealthStates = Object.values(analysis.elasticache.clusters).map(c => c.health);
            if (clusterHealthStates.includes('critical')) {
                analysis.elasticache.overallHealth = 'critical';
            } else if (clusterHealthStates.includes('warning')) {
                analysis.elasticache.overallHealth = 'warning';
            }

            logger.debug('AWS performance analysis completed', analysis);
            return analysis;

        } catch (error) {
            logger.error('AWS performance analysis failed:', error);
            return analysis;
        }
    }

    /**
     * Generate optimization recommendations
     */
    async generateOptimizationRecommendations() {
        const recommendations = [];

        try {
            const analysis = await this.analyzeAWSPerformance();

            // CloudFront recommendations
            if (analysis.cloudfront.issues.length > 0) {
                for (const issue of analysis.cloudfront.issues) {
                    switch (issue.type) {
                        case 'HIGH_ERROR_RATE':
                            recommendations.push({
                                service: 'CloudFront',
                                type: 'ERROR_RATE_OPTIMIZATION',
                                priority: 'HIGH',
                                description: `CloudFront error rate is ${issue.value.toFixed(2)}%, exceeding threshold of ${issue.threshold}%`,
                                suggestions: [
                                    'Review origin server health and capacity',
                                    'Check cache behaviors and TTL settings',
                                    'Implement proper error pages',
                                    'Consider enabling CloudFront Shield for DDoS protection'
                                ],
                                estimatedImpact: 'High performance improvement'
                            });
                            break;

                        case 'HIGH_LATENCY':
                            recommendations.push({
                                service: 'CloudFront',
                                type: 'LATENCY_OPTIMIZATION',
                                priority: 'MEDIUM',
                                description: `CloudFront origin latency is ${issue.value.toFixed(2)}ms, exceeding threshold of ${issue.threshold}ms`,
                                suggestions: [
                                    'Optimize origin server response times',
                                    'Increase cache TTL for static content',
                                    'Consider using CloudFront regional edge caches',
                                    'Review geographic distribution of edge locations'
                                ],
                                estimatedImpact: 'Medium performance improvement'
                            });
                            break;
                    }
                }
            }

            // ElastiCache recommendations
            for (const [clusterId, cluster] of Object.entries(analysis.elasticache.clusters)) {
                if (cluster.issues.length > 0) {
                    for (const issue of cluster.issues) {
                        switch (issue.type) {
                            case 'HIGH_CPU':
                                recommendations.push({
                                    service: 'ElastiCache',
                                    cluster: clusterId,
                                    type: 'CPU_OPTIMIZATION',
                                    priority: 'HIGH',
                                    description: `ElastiCache cluster ${clusterId} CPU utilization is ${issue.value.toFixed(2)}%`,
                                    suggestions: [
                                        'Scale up to a larger instance type',
                                        'Add read replicas to distribute load',
                                        'Optimize application queries',
                                        'Consider implementing connection pooling'
                                    ],
                                    estimatedImpact: 'High performance improvement'
                                });
                                break;

                            case 'HIGH_MEMORY':
                                recommendations.push({
                                    service: 'ElastiCache',
                                    cluster: clusterId,
                                    type: 'MEMORY_OPTIMIZATION',
                                    priority: 'CRITICAL',
                                    description: `ElastiCache cluster ${clusterId} memory usage is ${issue.value.toFixed(2)}%`,
                                    suggestions: [
                                        'Scale up to a memory-optimized instance type',
                                        'Implement data compression',
                                        'Review and optimize TTL settings',
                                        'Consider data partitioning strategies'
                                    ],
                                    estimatedImpact: 'Critical stability improvement'
                                });
                                break;

                            case 'LOW_CACHE_HIT_RATE':
                                recommendations.push({
                                    service: 'ElastiCache',
                                    cluster: clusterId,
                                    type: 'CACHE_EFFICIENCY_OPTIMIZATION',
                                    priority: 'MEDIUM',
                                    description: `ElastiCache cluster ${clusterId} cache hit rate is ${issue.value.toFixed(2)}%`,
                                    suggestions: [
                                        'Review caching strategies and key patterns',
                                        'Optimize TTL settings for different data types',
                                        'Implement cache warming strategies',
                                        'Analyze and optimize query patterns'
                                    ],
                                    estimatedImpact: 'Medium cost and performance improvement'
                                });
                                break;

                            case 'HIGH_EVICTIONS':
                                recommendations.push({
                                    service: 'ElastiCache',
                                    cluster: clusterId,
                                    type: 'EVICTION_OPTIMIZATION',
                                    priority: 'HIGH',
                                    description: `ElastiCache cluster ${clusterId} has high eviction rate: ${issue.value.toFixed(2)} evictions`,
                                    suggestions: [
                                        'Increase memory capacity',
                                        'Implement better memory management policies',
                                        'Review and optimize data structures',
                                        'Consider data archiving strategies'
                                    ],
                                    estimatedImpact: 'High performance improvement'
                                });
                                break;
                        }
                    }
                }
            }

            // General cost optimization recommendations
            if (recommendations.length === 0) {
                recommendations.push({
                    service: 'General',
                    type: 'COST_OPTIMIZATION',
                    priority: 'LOW',
                    description: 'AWS services are performing well, consider cost optimization opportunities',
                    suggestions: [
                        'Review CloudFront price classes for geographic optimization',
                        'Consider ElastiCache reserved instances for long-term workloads',
                        'Implement S3 lifecycle policies for log archival',
                        'Enable detailed billing and cost allocation tags'
                    ],
                    estimatedImpact: 'Cost savings'
                });
            }

            logger.info(`Generated ${recommendations.length} AWS optimization recommendations`);
            return recommendations;

        } catch (error) {
            logger.error('Failed to generate optimization recommendations:', error);
            return recommendations;
        }
    }

    /**
     * Create CloudFront alarms
     */
    async createCloudFrontAlarms(distributionId) {
        const alarmConfigs = [
            {
                AlarmName: `CloudFront-${distributionId}-4xxErrorRate`,
                MetricName: '4xxErrorRate',
                Threshold: 5,
                ComparisonOperator: 'GreaterThanThreshold',
                Description: 'CloudFront 4xx error rate is high'
            },
            {
                AlarmName: `CloudFront-${distributionId}-5xxErrorRate`,
                MetricName: '5xxErrorRate',
                Threshold: 2,
                ComparisonOperator: 'GreaterThanThreshold',
                Description: 'CloudFront 5xx error rate is high'
            },
            {
                AlarmName: `CloudFront-${distributionId}-OriginLatency`,
                MetricName: 'OriginLatency',
                Threshold: 1000,
                ComparisonOperator: 'GreaterThanThreshold',
                Description: 'CloudFront origin latency is high'
            },
            {
                AlarmName: `CloudFront-${distributionId}-RequestCount`,
                MetricName: 'Requests',
                Threshold: 10000,
                ComparisonOperator: 'GreaterThanThreshold',
                Description: 'CloudFront request count is unusually high'
            }
        ];

        for (const alarmConfig of alarmConfigs) {
            try {
                await this.cloudWatch.putMetricAlarm({
                    AlarmName: alarmConfig.AlarmName,
                    AlarmDescription: alarmConfig.Description,
                    MetricName: alarmConfig.MetricName,
                    Namespace: 'AWS/CloudFront',
                    Statistic: 'Average',
                    Period: 300,
                    EvaluationPeriods: 2,
                    Threshold: alarmConfig.Threshold,
                    ComparisonOperator: alarmConfig.ComparisonOperator,
                    Dimensions: [
                        {
                            Name: 'DistributionId',
                            Value: distributionId
                        }
                    ],
                    AlarmActions: [
                        process.env.SNS_ALARM_TOPIC_ARN
                    ],
                    TreatMissingData: 'notBreaching'
                }).promise();

                logger.debug(`CloudFront alarm created: ${alarmConfig.AlarmName}`);

            } catch (error) {
                logger.warn(`Failed to create CloudFront alarm ${alarmConfig.AlarmName}:`, error.message);
            }
        }
    }

    /**
     * Apply optimization recommendations automatically
     */
    async applyOptimizationRecommendations(recommendations, options = { dryRun: true }) {
        const results = [];

        for (const recommendation of recommendations) {
            try {
                logger.info(`Applying recommendation: ${recommendation.type}`, {
                    service: recommendation.service,
                    priority: recommendation.priority,
                    dryRun: options.dryRun
                });

                let result;
                switch (recommendation.type) {
                    case 'CPU_OPTIMIZATION':
                        result = await this.applyCPUOptimization(recommendation, options);
                        break;
                    case 'MEMORY_OPTIMIZATION':
                        result = await this.applyMemoryOptimization(recommendation, options);
                        break;
                    case 'CACHE_EFFICIENCY_OPTIMIZATION':
                        result = await this.applyCacheEfficiencyOptimization(recommendation, options);
                        break;
                    default:
                        result = {
                            recommendation,
                            status: 'manual_review_required',
                            message: 'This recommendation requires manual review and implementation'
                        };
                }

                results.push(result);

            } catch (error) {
                logger.error(`Failed to apply recommendation ${recommendation.type}:`, error);
                results.push({
                    recommendation,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Generate comprehensive AWS optimization report
     */
    async generateOptimizationReport() {
        try {
            const report = {
                generatedAt: new Date(),
                summary: {
                    servicesAnalyzed: 3, // CloudFront, ElastiCache, S3
                    totalRecommendations: 0,
                    criticalIssues: 0,
                    estimatedMonthlySavings: 0
                },
                services: {
                    cloudfront: {},
                    elasticache: {},
                    s3: {}
                },
                recommendations: [],
                nextSteps: []
            };

            // Collect current performance analysis
            const analysis = await this.analyzeAWSPerformance();
            report.services.cloudfront = analysis.cloudfront;
            report.services.elasticache = analysis.elasticache;

            // Generate recommendations
            const recommendations = await this.generateOptimizationRecommendations();
            report.recommendations = recommendations;
            report.summary.totalRecommendations = recommendations.length;

            // Count critical issues
            report.summary.criticalIssues = recommendations.filter(r => r.priority === 'CRITICAL').length;

            // Estimate monthly savings (simplified calculation)
            report.summary.estimatedMonthlySavings = this.estimateMonthlySavings(recommendations);

            // Generate next steps
            report.nextSteps = this.generateNextSteps(recommendations);

            // Save report
            await this.saveOptimizationReport(report);

            logger.info('AWS optimization report generated successfully', {
                recommendations: report.summary.totalRecommendations,
                criticalIssues: report.summary.criticalIssues
            });

            return report;

        } catch (error) {
            logger.error('Failed to generate AWS optimization report:', error);
            throw error;
        }
    }

    // Helper methods
    addStrategy(strategyId, strategy) {
        this.optimizationStrategies.set(strategyId, strategy);
    }

    async applyCPUOptimization(recommendation, options) {
        if (options.dryRun) {
            return {
                recommendation,
                status: 'dry_run',
                suggestedAction: 'Scale up ElastiCache instance type',
                estimatedCost: '$200-500/month additional'
            };
        }

        // Implementation for actual CPU optimization
        return {
            recommendation,
            status: 'requires_manual_intervention',
            message: 'ElastiCache scaling requires planned maintenance window'
        };
    }

    async applyMemoryOptimization(recommendation, options) {
        if (options.dryRun) {
            return {
                recommendation,
                status: 'dry_run',
                suggestedAction: 'Scale up to memory-optimized instance',
                estimatedCost: '$300-800/month additional'
            };
        }

        // Implementation for actual memory optimization
        return {
            recommendation,
            status: 'requires_manual_intervention',
            message: 'Memory optimization requires instance type change'
        };
    }

    async applyCacheEfficiencyOptimization(recommendation, options) {
        if (options.dryRun) {
            return {
                recommendation,
                status: 'dry_run',
                suggestedAction: 'Implement cache warming and TTL optimization',
                estimatedSavings: '$100-300/month'
            };
        }

        // Implementation for cache efficiency optimization
        return {
            recommendation,
            status: 'configuration_update_required',
            message: 'Update application cache configuration'
        };
    }

    estimateMonthlySavings(recommendations) {
        let totalSavings = 0;

        for (const rec of recommendations) {
            switch (rec.type) {
                case 'CACHE_EFFICIENCY_OPTIMIZATION':
                    totalSavings += 200; // Estimated $200/month savings
                    break;
                case 'ERROR_RATE_OPTIMIZATION':
                    totalSavings += 150; // Reduced origin server load
                    break;
                case 'COST_OPTIMIZATION':
                    totalSavings += 300; // General cost optimizations
                    break;
                default:
                    totalSavings += 50; // Minimal savings for other optimizations
            }
        }

        return totalSavings;
    }

    generateNextSteps(recommendations) {
        const steps = [];

        const criticalRecs = recommendations.filter(r => r.priority === 'CRITICAL');
        const highRecs = recommendations.filter(r => r.priority === 'HIGH');

        if (criticalRecs.length > 0) {
            steps.push('Address critical ElastiCache memory issues immediately');
        }

        if (highRecs.length > 0) {
            steps.push('Plan maintenance window for high-priority optimizations');
        }

        steps.push('Implement continuous monitoring for AWS services');
        steps.push('Set up automated alerting for performance thresholds');
        steps.push('Schedule regular optimization reviews (monthly)');

        return steps;
    }

    async saveOptimizationReport(report) {
        try {
            const reportsDir = 'reports/aws-optimization';
            await fs.mkdir(reportsDir, { recursive: true });

            const reportFile = path.join(reportsDir, `aws-optimization-${Date.now()}.json`);
            await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

            logger.info(`AWS optimization report saved: ${reportFile}`);
        } catch (error) {
            logger.error('Failed to save optimization report:', error);
        }
    }
}

// Export singleton instance
export const awsServicesOptimizer = new AWSServicesOptimizer();

