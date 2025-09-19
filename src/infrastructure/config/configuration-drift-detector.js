// src/infrastructure/config/configuration-drift-detector.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

/**
 * Configuration Drift Detector
 * Detects and reports configuration drift across environments and deployments
 */
export class ConfigurationDriftDetector extends EventEmitter {
    constructor() {
        super();
        this.baselineConfigs = new Map();
        this.currentConfigs = new Map();
        this.driftHistory = [];
        this.driftRules = new Map();
        this.monitoredPaths = new Set();
        this.scanners = new Map();
        this.watchers = new Map();
        this.isMonitoring = false;

        this.initializeDriftDetection();
    }

    /**
     * Initialize drift detection system
     */
    initializeDriftDetection() {
        this.setupDriftRules();
        this.setupConfigurationScanners();
        this.startDriftMonitoring();
    }

    /**
     * Setup drift detection rules
     */
    setupDriftRules() {
        // Critical configuration drift rules
        this.addDriftRule('CRITICAL_SECURITY_CONFIG', {
            name: 'Critical Security Configuration Drift',
            description: 'Detects changes to critical security configurations',
            severity: 'CRITICAL',
            configPaths: [
                'security.jwt.secret',
                'security.encryption.key',
                'database.password',
                'api.cors.origin',
                'ssl.certificate'
            ],
            allowedChanges: [],
            requireApproval: true,
            autoRemediate: false
        });

        // Database configuration drift rules
        this.addDriftRule('DATABASE_CONFIG_DRIFT', {
            name: 'Database Configuration Drift',
            description: 'Detects changes to database configurations',
            severity: 'HIGH',
            configPaths: [
                'database.host',
                'database.port',
                'database.username',
                'database.poolSize',
                'database.ssl'
            ],
            allowedChanges: ['database.poolSize'],
            requireApproval: true,
            autoRemediate: false
        });

        // API configuration drift rules
        this.addDriftRule('API_CONFIG_DRIFT', {
            name: 'API Configuration Drift',
            description: 'Detects changes to API configurations',
            severity: 'MEDIUM',
            configPaths: [
                'api.port',
                'api.baseUrl',
                'api.rateLimit',
                'api.timeout'
            ],
            allowedChanges: ['api.rateLimit.max', 'api.timeout'],
            requireApproval: false,
            autoRemediate: true
        });

        // Performance configuration drift rules
        this.addDriftRule('PERFORMANCE_CONFIG_DRIFT', {
            name: 'Performance Configuration Drift',
            description: 'Detects changes to performance-related configurations',
            severity: 'LOW',
            configPaths: [
                'cache.ttl',
                'cache.maxSize',
                'logging.level',
                'monitoring.interval'
            ],
            allowedChanges: ['cache.ttl', 'logging.level'],
            requireApproval: false,
            autoRemediate: true
        });

        // Infrastructure configuration drift rules
        this.addDriftRule('INFRASTRUCTURE_CONFIG_DRIFT', {
            name: 'Infrastructure Configuration Drift',
            description: 'Detects changes to infrastructure configurations',
            severity: 'HIGH',
            configPaths: [
                'aws.region',
                'aws.s3.bucket',
                'redis.host',
                'redis.port',
                'kubernetes.namespace'
            ],
            allowedChanges: [],
            requireApproval: true,
            autoRemediate: false
        });
    }

    /**
     * Setup configuration scanners
     */
    setupConfigurationScanners() {
        // File-based configuration scanner
        this.addScanner('FILE_SCANNER', {
            name: 'File System Configuration Scanner',
            description: 'Scans configuration files in the filesystem',
            scan: async (paths) => {
                const configurations = new Map();

                for (const configPath of paths) {
                    try {
                        const fullPath = path.resolve(configPath);
                        const stats = await fs.stat(fullPath);

                        if (stats.isDirectory()) {
                            // Scan directory for config files
                            const files = await fs.readdir(fullPath);
                            for (const file of files) {
                                if (this.isConfigFile(file)) {
                                    const filePath = path.join(fullPath, file);
                                    const config = await this.loadConfigFile(filePath);
                                    configurations.set(filePath, config);
                                }
                            }
                        } else if (this.isConfigFile(configPath)) {
                            // Single config file
                            const config = await this.loadConfigFile(fullPath);
                            configurations.set(fullPath, config);
                        }
                    } catch (error) {
                        logger.warn(`Failed to scan configuration path: ${configPath}`, error);
                    }
                }

                return configurations;
            }
        });

        // Environment variable scanner
        this.addScanner('ENV_SCANNER', {
            name: 'Environment Variables Scanner',
            description: 'Scans environment variables for configuration',
            scan: async () => {
                const configurations = new Map();
                const envConfig = {};

                // Extract configuration from environment variables
                for (const [key, value] of Object.entries(process.env)) {
                    if (key.startsWith('SCHOOL_ERP_') || key.startsWith('NODE_') || key.startsWith('DB_')) {
                        envConfig[key] = value;
                    }
                }

                configurations.set('environment_variables', envConfig);
                return configurations;
            }
        });

        // Docker/Kubernetes scanner
        this.addScanner('CONTAINER_SCANNER', {
            name: 'Container Configuration Scanner',
            description: 'Scans container and Kubernetes configurations',
            scan: async () => {
                const configurations = new Map();

                try {
                    // Scan Docker compose files
                    const composeFiles = ['docker-compose.yml', 'docker-compose.override.yml'];
                    for (const file of composeFiles) {
                        try {
                            if (await this.fileExists(file)) {
                                const config = await this.loadConfigFile(file);
                                configurations.set(file, config);
                            }
                        } catch (error) {
                            // File doesn't exist, continue
                        }
                    }

                    // Scan Kubernetes manifests
                    const k8sDir = 'k8s';
                    if (await this.fileExists(k8sDir)) {
                        const k8sFiles = await fs.readdir(k8sDir);
                        for (const file of k8sFiles) {
                            if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                                const filePath = path.join(k8sDir, file);
                                const config = await this.loadConfigFile(filePath);
                                configurations.set(filePath, config);
                            }
                        }
                    }
                } catch (error) {
                    logger.warn('Container configuration scan failed:', error);
                }

                return configurations;
            }
        });

        // AWS configuration scanner
        this.addScanner('AWS_SCANNER', {
            name: 'AWS Configuration Scanner',
            description: 'Scans AWS resource configurations',
            scan: async () => {
                const configurations = new Map();

                // This would integrate with AWS APIs to fetch current configurations
                // For now, return placeholder
                configurations.set('aws_config', {
                    region: process.env.AWS_REGION || 'us-east-1',
                    services: {
                        s3: { buckets: [] },
                        ec2: { instances: [] },
                        rds: { databases: [] }
                    }
                });

                return configurations;
            }
        });
    }

    /**
     * Create baseline configuration snapshot
     */
    async createBaseline(name, configPaths = []) {
        try {
            logger.info(`Creating configuration baseline: ${name}`);

            const baseline = {
                name,
                createdAt: new Date(),
                configurations: new Map(),
                checksums: new Map(),
                metadata: {
                    environment: process.env.NODE_ENV || 'development',
                    version: process.env.BUILD_VERSION || 'unknown',
                    paths: configPaths
                }
            };

            // Scan all specified configuration sources
            for (const [scannerId, scanner] of this.scanners) {
                try {
                    logger.debug(`Running scanner: ${scannerId}`);
                    const scanResults = await scanner.scan(configPaths);

                    for (const [configPath, config] of scanResults) {
                        baseline.configurations.set(configPath, config);
                        baseline.checksums.set(configPath, this.calculateChecksum(config));
                    }
                } catch (error) {
                    logger.error(`Scanner failed: ${scannerId}`, error);
                }
            }

            // Store baseline
            this.baselineConfigs.set(name, baseline);

            // Save baseline to file
            await this.saveBaselineToFile(baseline);

            logger.info(`Configuration baseline created: ${name}`, {
                configurations: baseline.configurations.size,
                checksums: baseline.checksums.size
            });

            return {
                success: true,
                name,
                configurationsCount: baseline.configurations.size,
                createdAt: baseline.createdAt
            };

        } catch (error) {
            logger.error(`Failed to create configuration baseline: ${name}`, error);
            throw error;
        }
    }

    /**
     * Scan for configuration drift
     */
    async scanForDrift(baselineName = null, configPaths = []) {
        try {
            logger.info(`Scanning for configuration drift`);

            const driftScan = {
                scanId: `drift_scan_${Date.now()}`,
                startTime: new Date(),
                baselineName,
                driftDetected: false,
                totalConfigs: 0,
                driftedConfigs: 0,
                drifts: [],
                summary: {
                    critical: 0,
                    high: 0,
                    medium: 0,
                    low: 0
                }
            };

            // Get baseline to compare against
            let baseline;
            if (baselineName) {
                baseline = this.baselineConfigs.get(baselineName);
                if (!baseline) {
                    throw new Error(`Baseline not found: ${baselineName}`);
                }
            } else {
                // Use the most recent baseline
                const baselines = Array.from(this.baselineConfigs.values());
                baseline = baselines.sort((a, b) => b.createdAt - a.createdAt)[0];
                if (!baseline) {
                    throw new Error('No baseline found for comparison');
                }
                driftScan.baselineName = baseline.name;
            }

            logger.debug(`Using baseline: ${baseline.name} (created: ${baseline.createdAt})`);

            // Scan current configurations
            const currentConfigs = new Map();
            for (const [scannerId, scanner] of this.scanners) {
                try {
                    const scanResults = await scanner.scan(configPaths.length > 0 ? configPaths : baseline.metadata.paths);

                    for (const [configPath, config] of scanResults) {
                        currentConfigs.set(configPath, config);
                    }
                } catch (error) {
                    logger.error(`Scanner failed during drift scan: ${scannerId}`, error);
                }
            }

            driftScan.totalConfigs = currentConfigs.size;

            // Compare configurations and detect drift
            for (const [configPath, currentConfig] of currentConfigs) {
                const baselineConfig = baseline.configurations.get(configPath);
                const baselineChecksum = baseline.checksums.get(configPath);
                const currentChecksum = this.calculateChecksum(currentConfig);

                if (baselineConfig && baselineChecksum !== currentChecksum) {
                    // Configuration has drifted
                    const driftAnalysis = await this.analyzeDrift(
                        configPath,
                        baselineConfig,
                        currentConfig,
                        baseline.createdAt
                    );

                    if (driftAnalysis.hasDrift) {
                        driftScan.driftedConfigs++;
                        driftScan.driftDetected = true;
                        driftScan.drifts.push(driftAnalysis);
                        driftScan.summary[driftAnalysis.severity.toLowerCase()]++;

                        logger.warn(`Configuration drift detected: ${configPath}`, {
                            severity: driftAnalysis.severity,
                            changes: driftAnalysis.changes.length
                        });
                    }
                } else if (!baselineConfig) {
                    // New configuration file
                    const newConfigDrift = {
                        configPath,
                        type: 'NEW_CONFIG',
                        severity: 'MEDIUM',
                        detectedAt: new Date(),
                        description: 'New configuration file detected',
                        changes: [{
                            type: 'ADDED',
                            path: configPath,
                            description: 'Configuration file was added'
                        }]
                    };

                    driftScan.drifts.push(newConfigDrift);
                    driftScan.driftedConfigs++;
                    driftScan.driftDetected = true;
                    driftScan.summary.medium++;
                }
            }

            // Check for removed configurations
            for (const [configPath] of baseline.configurations) {
                if (!currentConfigs.has(configPath)) {
                    const removedConfigDrift = {
                        configPath,
                        type: 'REMOVED_CONFIG',
                        severity: 'HIGH',
                        detectedAt: new Date(),
                        description: 'Configuration file was removed',
                        changes: [{
                            type: 'REMOVED',
                            path: configPath,
                            description: 'Configuration file was removed'
                        }]
                    };

                    driftScan.drifts.push(removedConfigDrift);
                    driftScan.driftedConfigs++;
                    driftScan.driftDetected = true;
                    driftScan.summary.high++;
                }
            }

            driftScan.endTime = new Date();
            driftScan.duration = driftScan.endTime - driftScan.startTime;

            // Store current configurations
            this.currentConfigs.set(driftScan.scanId, currentConfigs);

            // Record drift scan in history
            this.driftHistory.push(driftScan);

            // Keep only last 1000 drift scans
            if (this.driftHistory.length > 1000) {
                this.driftHistory = this.driftHistory.slice(-1000);
            }

            // Emit drift detection event
            if (driftScan.driftDetected) {
                this.emit('driftDetected', driftScan);
            }

            // Auto-remediate if configured
            if (driftScan.driftDetected) {
                await this.handleAutoRemediation(driftScan);
            }

            logger.info(`Configuration drift scan completed`, {
                scanId: driftScan.scanId,
                driftDetected: driftScan.driftDetected,
                driftedConfigs: driftScan.driftedConfigs,
                duration: driftScan.duration
            });

            return driftScan;

        } catch (error) {
            logger.error('Configuration drift scan failed:', error);
            throw error;
        }
    }

    /**
     * Analyze configuration drift
     */
    async analyzeDrift(configPath, baselineConfig, currentConfig, baselineTime) {
        const driftAnalysis = {
            configPath,
            type: 'CONFIG_MODIFIED',
            severity: 'LOW',
            detectedAt: new Date(),
            baselineTime,
            hasDrift: false,
            description: '',
            changes: [],
            affectedRules: []
        };

        // Deep compare configurations
        const changes = this.deepCompare(baselineConfig, currentConfig, '');
        driftAnalysis.changes = changes;
        driftAnalysis.hasDrift = changes.length > 0;

        if (driftAnalysis.hasDrift) {
            // Determine severity based on drift rules
            let maxSeverity = 'LOW';

            for (const change of changes) {
                for (const [ruleId, rule] of this.driftRules) {
                    if (rule.configPaths.some(path => change.path.includes(path))) {
                        driftAnalysis.affectedRules.push(ruleId);

                        // Update severity if this rule is more severe
                        const severityLevels = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
                        if (severityLevels[rule.severity] > severityLevels[maxSeverity]) {
                            maxSeverity = rule.severity;
                        }
                    }
                }
            }

            driftAnalysis.severity = maxSeverity;
            driftAnalysis.description = `Configuration drift detected with ${changes.length} changes (${maxSeverity} severity)`;
        }

        return driftAnalysis;
    }

    /**
     * Start continuous drift monitoring
     */
    startDriftMonitoring(interval = 300000) { // 5 minutes default
        if (this.isMonitoring) {
            logger.warn('Drift monitoring is already active');
            return;
        }

        this.isMonitoring = true;

        this.monitoringInterval = setInterval(async () => {
            try {
                await this.scanForDrift();
            } catch (error) {
                logger.error('Continuous drift monitoring failed:', error);
            }
        }, interval);

        // Also monitor file changes for real-time detection
        this.setupFileWatchers();

        logger.info(`Configuration drift monitoring started (interval: ${interval}ms)`);
    }

    /**
     * Stop drift monitoring
     */
    stopDriftMonitoring() {
        if (!this.isMonitoring) {
            logger.warn('Drift monitoring is not active');
            return;
        }

        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        // Stop file watchers
        for (const [path, watcher] of this.watchers) {
            watcher.close();
        }
        this.watchers.clear();

        logger.info('Configuration drift monitoring stopped');
    }

    /**
     * Setup file system watchers
     */
    async setupFileWatchers() {
        const configPaths = [
            'config/',
            'docker-compose.yml',
            'k8s/',
            '.env'
        ];

        for (const configPath of configPaths) {
            try {
                if (await this.fileExists(configPath)) {
                    const chokidar = await import('chokidar');
                    const watcher = chokidar.watch(configPath, {
                        ignored: /node_modules|\.git/,
                        persistent: true,
                        ignoreInitial: true
                    });

                    watcher.on('change', async (filePath) => {
                        logger.debug(`Configuration file changed: ${filePath}`);

                        // Trigger drift scan for this specific file
                        setTimeout(async () => {
                            try {
                                await this.scanForDrift(null, [filePath]);
                            } catch (error) {
                                logger.error(`File change drift scan failed: ${filePath}`, error);
                            }
                        }, 1000); // Debounce file changes
                    });

                    this.watchers.set(configPath, watcher);
                }
            } catch (error) {
                logger.warn(`Failed to setup file watcher for: ${configPath}`, error);
            }
        }
    }

    /**
     * Handle automatic remediation
     */
    async handleAutoRemediation(driftScan) {
        logger.info(`Handling auto-remediation for drift scan: ${driftScan.scanId}`);

        for (const drift of driftScan.drifts) {
            // Find applicable drift rules
            const applicableRules = drift.affectedRules
                .map(ruleId => this.driftRules.get(ruleId))
                .filter(rule => rule && rule.autoRemediate);

            for (const rule of applicableRules) {
                try {
                    logger.info(`Auto-remediating drift using rule: ${rule.name}`);

                    // For now, just log the remediation action
                    // In production, this would perform actual remediation
                    logger.info(`Would remediate configuration: ${drift.configPath}`, {
                        rule: rule.name,
                        severity: drift.severity,
                        changes: drift.changes.length
                    });

                } catch (error) {
                    logger.error(`Auto-remediation failed: ${rule.name}`, error);
                }
            }
        }
    }

    // src/infrastructure/config/configuration-drift-detector.js (continued)

    /**
     * Generate drift report
     */
    async generateDriftReport(timeRange = '24h') {
        try {
            const report = {
                generatedAt: new Date(),
                timeRange,
                summary: {
                    totalScans: 0,
                    driftDetected: 0,
                    configurationsMonitored: this.monitoredPaths.size,
                    averageDriftsPerScan: 0
                },
                driftTrends: {
                    byHour: {},
                    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
                    byConfigPath: {},
                    byRule: {}
                },
                recentDrifts: [],
                recommendations: []
            };

            // Filter drift history by time range
            const cutoff = Date.now() - this.parseTimeRange(timeRange);
            const filteredHistory = this.driftHistory.filter(
                scan => scan.startTime.getTime() > cutoff
            );

            report.summary.totalScans = filteredHistory.length;
            report.summary.driftDetected = filteredHistory.filter(scan => scan.driftDetected).length;

            // Analyze drift trends
            let totalDrifts = 0;

            for (const scan of filteredHistory) {
                totalDrifts += scan.drifts.length;

                // Aggregate by hour
                const hour = scan.startTime.getHours();
                report.driftTrends.byHour[hour] = (report.driftTrends.byHour[hour] || 0) + scan.drifts.length;

                // Aggregate by severity
                for (const drift of scan.drifts) {
                    const severity = drift.severity.toLowerCase();
                    if (report.driftTrends.bySeverity[severity] !== undefined) {
                        report.driftTrends.bySeverity[severity]++;
                    }

                    // Aggregate by config path
                    const configPath = drift.configPath;
                    if (!report.driftTrends.byConfigPath[configPath]) {
                        report.driftTrends.byConfigPath[configPath] = 0;
                    }
                    report.driftTrends.byConfigPath[configPath]++;

                    // Aggregate by rule
                    for (const ruleId of drift.affectedRules || []) {
                        if (!report.driftTrends.byRule[ruleId]) {
                            report.driftTrends.byRule[ruleId] = 0;
                        }
                        report.driftTrends.byRule[ruleId]++;
                    }
                }
            }

            // Calculate average drifts per scan
            report.summary.averageDriftsPerScan = filteredHistory.length > 0
                ? Math.round((totalDrifts / filteredHistory.length) * 100) / 100
                : 0;

            // Get recent drifts (last 10)
            const allDrifts = filteredHistory
                .flatMap(scan => scan.drifts.map(drift => ({ ...drift, scanId: scan.scanId })))
                .sort((a, b) => b.detectedAt - a.detectedAt);

            report.recentDrifts = allDrifts.slice(0, 10);

            // Generate recommendations
            report.recommendations = this.generateDriftRecommendations(report);

            logger.info('Configuration drift report generated', {
                timeRange,
                totalScans: report.summary.totalScans,
                driftDetected: report.summary.driftDetected,
                avgDriftsPerScan: report.summary.averageDriftsPerScan
            });

            return report;

        } catch (error) {
            logger.error('Failed to generate drift report:', error);
            throw error;
        }
    }

    /**
     * Deep compare two configurations
     */
    deepCompare(obj1, obj2, path = '') {
        const changes = [];

        // Handle null/undefined cases
        if (obj1 === null && obj2 === null) return changes;
        if (obj1 === null) {
            changes.push({
                type: 'ADDED',
                path,
                description: `Value was added`,
                newValue: obj2
            });
            return changes;
        }
        if (obj2 === null) {
            changes.push({
                type: 'REMOVED',
                path,
                description: `Value was removed`,
                oldValue: obj1
            });
            return changes;
        }

        // Handle primitive values
        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
            if (obj1 !== obj2) {
                changes.push({
                    type: 'MODIFIED',
                    path,
                    description: `Value changed from ${obj1} to ${obj2}`,
                    oldValue: obj1,
                    newValue: obj2
                });
            }
            return changes;
        }

        // Handle arrays
        if (Array.isArray(obj1) && Array.isArray(obj2)) {
            const maxLength = Math.max(obj1.length, obj2.length);
            for (let i = 0; i < maxLength; i++) {
                const currentPath = path ? `${path}[${i}]` : `[${i}]`;
                if (i >= obj1.length) {
                    changes.push({
                        type: 'ADDED',
                        path: currentPath,
                        description: `Array element was added`,
                        newValue: obj2[i]
                    });
                } else if (i >= obj2.length) {
                    changes.push({
                        type: 'REMOVED',
                        path: currentPath,
                        description: `Array element was removed`,
                        oldValue: obj1[i]
                    });
                } else {
                    changes.push(...this.deepCompare(obj1[i], obj2[i], currentPath));
                }
            }
            return changes;
        }

        // Handle objects
        const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

        for (const key of allKeys) {
            const currentPath = path ? `${path}.${key}` : key;

            if (!(key in obj1)) {
                changes.push({
                    type: 'ADDED',
                    path: currentPath,
                    description: `Property was added`,
                    newValue: obj2[key]
                });
            } else if (!(key in obj2)) {
                changes.push({
                    type: 'REMOVED',
                    path: currentPath,
                    description: `Property was removed`,
                    oldValue: obj1[key]
                });
            } else {
                changes.push(...this.deepCompare(obj1[key], obj2[key], currentPath));
            }
        }

        return changes;
    }

    /**
     * Check if file is a configuration file
     */
    isConfigFile(filename) {
        const configExtensions = ['.yaml', '.yml', '.json', '.env', '.conf', '.config', '.properties'];
        const configFilenames = ['Dockerfile', 'docker-compose.yml', '.env', 'package.json'];

        return configExtensions.some(ext => filename.endsWith(ext)) ||
            configFilenames.includes(filename);
    }

    /**
     * Load configuration file
     */
    async loadConfigFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const ext = path.extname(filePath).toLowerCase();

            switch (ext) {
                case '.yaml':
                case '.yml':
                    return yaml.load(content);
                case '.json':
                    return JSON.parse(content);
                case '.env':
                    return this.parseEnvFile(content);
                default:
                    return { content }; // Return as string for other file types
            }
        } catch (error) {
            logger.warn(`Failed to load config file: ${filePath}`, error);
            return {};
        }
    }

    /**
     * Parse environment file
     */
    parseEnvFile(content) {
        const result = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const equalIndex = trimmed.indexOf('=');
                if (equalIndex > 0) {
                    const key = trimmed.substring(0, equalIndex);
                    const value = trimmed.substring(equalIndex + 1);
                    result[key] = value.replace(/^["']|["']$/g, ''); // Remove quotes
                }
            }
        }

        return result;
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Calculate configuration checksum
     */
    calculateChecksum(config) {
        const configString = JSON.stringify(config, Object.keys(config).sort());
        return crypto.createHash('sha256').update(configString).digest('hex');
    }

    /**
     * Save baseline to file
     */
    async saveBaselineToFile(baseline) {
        try {
            const baselinesDir = path.join('.baselines');
            await fs.mkdir(baselinesDir, { recursive: true });

            const baselineFile = path.join(baselinesDir, `${baseline.name}.json`);

            // Convert Map to Object for JSON serialization
            const serializable = {
                ...baseline,
                configurations: Object.fromEntries(baseline.configurations),
                checksums: Object.fromEntries(baseline.checksums)
            };

            await fs.writeFile(baselineFile, JSON.stringify(serializable, null, 2));
            logger.debug(`Baseline saved to file: ${baselineFile}`);

        } catch (error) {
            logger.error('Failed to save baseline to file:', error);
        }
    }

    /**
     * Load baseline from file
     */
    async loadBaselineFromFile(name) {
        try {
            const baselineFile = path.join('.baselines', `${name}.json`);
            const content = await fs.readFile(baselineFile, 'utf-8');
            const data = JSON.parse(content);

            // Convert Object back to Map
            data.configurations = new Map(Object.entries(data.configurations));
            data.checksums = new Map(Object.entries(data.checksums));
            data.createdAt = new Date(data.createdAt);

            return data;

        } catch (error) {
            logger.error(`Failed to load baseline from file: ${name}`, error);
            throw error;
        }
    }

    /**
     * Parse time range string
     */
    parseTimeRange(timeRange) {
        const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const match = timeRange.match(/^(\d+)([smhd])$/);
        return match ? parseInt(match[1]) * units[match[2]] : 86400000; // Default 24h
    }

    /**
     * Generate drift recommendations
     */
    generateDriftRecommendations(report) {
        const recommendations = [];

        // High drift rate recommendation
        if (report.summary.averageDriftsPerScan > 5) {
            recommendations.push({
                type: 'HIGH_DRIFT_RATE',
                priority: 'HIGH',
                message: `High drift rate detected: ${report.summary.averageDriftsPerScan} drifts per scan`,
                action: 'Review configuration management processes and implement stricter controls'
            });
        }

        // Critical severity recommendation
        if (report.driftTrends.bySeverity.critical > 0) {
            recommendations.push({
                type: 'CRITICAL_DRIFTS',
                priority: 'CRITICAL',
                message: `${report.driftTrends.bySeverity.critical} critical configuration drifts detected`,
                action: 'Immediately review and remediate critical configuration changes'
            });
        }

        // Frequent config path changes
        const topChangedPaths = Object.entries(report.driftTrends.byConfigPath)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        if (topChangedPaths.length > 0 && topChangedPaths[0][1] > 3) {
            recommendations.push({
                type: 'FREQUENT_PATH_CHANGES',
                priority: 'MEDIUM',
                message: `Configuration path "${topChangedPaths[0][0]}" changed ${topChangedPaths[0][1]} times`,
                action: 'Review change control processes for frequently modified configurations'
            });
        }

        // No recent drifts - positive feedback
        if (report.summary.driftDetected === 0 && report.summary.totalScans > 0) {
            recommendations.push({
                type: 'GOOD_COMPLIANCE',
                priority: 'INFO',
                message: 'No configuration drifts detected in the specified time range',
                action: 'Continue current configuration management practices'
            });
        }

        return recommendations;
    }

    // Public API methods
    addDriftRule(ruleId, rule) {
        this.driftRules.set(ruleId, rule);
        logger.debug(`Drift rule added: ${ruleId}`);
    }

    addScanner(scannerId, scanner) {
        this.scanners.set(scannerId, scanner);
        logger.debug(`Scanner added: ${scannerId}`);
    }

    getDriftHistory(limit = 100) {
        return this.driftHistory
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);
    }

    getBaselines() {
        return Array.from(this.baselineConfigs.keys());
    }

    getBaseline(name) {
        return this.baselineConfigs.get(name);
    }

    getDriftRules() {
        return Array.from(this.driftRules.values());
    }

    getScanners() {
        return Array.from(this.scanners.keys());
    }

    isMonitoringActive() {
        return this.isMonitoring;
    }

    getMonitoringStatus() {
        return {
            active: this.isMonitoring,
            interval: this.monitoringInterval ? 'Active' : 'Inactive',
            watchers: this.watchers.size,
            baselineConfigs: this.baselineConfigs.size,
            totalScans: this.driftHistory.length,
            lastScan: this.driftHistory.length > 0
                ? this.driftHistory[this.driftHistory.length - 1].startTime
                : null
        };
    }

    async deleteBaseline(name) {
        try {
            // Remove from memory
            if (this.baselineConfigs.has(name)) {
                this.baselineConfigs.delete(name);
            }

            // Remove file
            const baselineFile = path.join('.baselines', `${name}.json`);
            if (await this.fileExists(baselineFile)) {
                await fs.unlink(baselineFile);
            }

            logger.info(`Baseline deleted: ${name}`);
            return { success: true };

        } catch (error) {
            logger.error(`Failed to delete baseline: ${name}`, error);
            throw error;
        }
    }

    async exportDriftData(format = 'json') {
        try {
            const exportData = {
                exportedAt: new Date(),
                format,
                baselines: Object.fromEntries(
                    Array.from(this.baselineConfigs.entries()).map(([name, baseline]) => [
                        name,
                        {
                            ...baseline,
                            configurations: Object.fromEntries(baseline.configurations),
                            checksums: Object.fromEntries(baseline.checksums)
                        }
                    ])
                ),
                driftHistory: this.driftHistory,
                driftRules: Object.fromEntries(this.driftRules)
            };

            const exportDir = path.join('.exports');
            await fs.mkdir(exportDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportFile = path.join(exportDir, `drift-export-${timestamp}.${format}`);

            if (format === 'json') {
                await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));
            } else if (format === 'yaml') {
                await fs.writeFile(exportFile, yaml.dump(exportData));
            } else {
                throw new Error(`Unsupported export format: ${format}`);
            }

            logger.info(`Drift data exported: ${exportFile}`);
            return { success: true, file: exportFile };

        } catch (error) {
            logger.error('Failed to export drift data:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const configurationDriftDetector = new ConfigurationDriftDetector();
