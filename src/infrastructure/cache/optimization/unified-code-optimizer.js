// src/infrastructure/optimization/unified-code-optimizer.js (continued)
import { deadCodeAnalyzer } from "./dead-code-analyzer.js";
import { bundleOptimizer } from "./bundle-optimizer.js";
import { treeShakingEngine } from "./tree-shaking-engine.js";
import { asyncAwaitOptimizer } from "./async-await-optimizer.js";
import { memoryLeakPrevention } from "./memory-leak-prevention.js";
import { logger } from "#utils/core/logger.js";
import fs from "fs/promises";
import path from "path";
import glob from "glob";

/**
 * Unified Code Optimization Service
 * Orchestrates all code optimization strategies
 */
export class UnifiedCodeOptimizer {
  constructor() {
    this.optimizers = {
      deadCode: deadCodeAnalyzer,
      bundle: bundleOptimizer,
      treeShaking: treeShakingEngine,
      asyncAwait: asyncAwaitOptimizer,
      memoryLeak: memoryLeakPrevention
    };
    this.optimizationHistory = [];
    this.performanceBaseline = null;
  }

  /**
   * Execute comprehensive code optimization
   */
  async executeCompleteOptimization(options = {}) {
    try {
      logger.info('Starting comprehensive code optimization');

      const results = {
        startedAt: new Date(),
        optimizations: {},
        summary: {
          totalOptimizations: 0,
          estimatedSavings: 0,
          performanceGains: 0,
          codeReduction: 0,
          memoryImprovement: 0
        }
      };

      // Capture baseline performance
      results.baseline = await this.capturePerformanceBaseline();

      // 1. Dead Code Elimination
      if (options.deadCode !== false) {
        logger.info('Executing dead code analysis...');
        results.optimizations.deadCode = await deadCodeAnalyzer.analyzeDeadCode();
        results.summary.totalOptimizations += results.optimizations.deadCode.findings?.length || 0;
        results.summary.estimatedSavings += results.optimizations.deadCode.summary?.estimatedSavings || 0;
      }

      // 2. Bundle Size Optimization
      if (options.bundleOptimization !== false) {
        logger.info('Executing bundle optimization...');
        results.optimizations.bundle = await bundleOptimizer.optimizeBundles(
          options.entryPoints || ['src/server.js'],
          options.outputPath || 'dist/optimized'
        );
        
        if (results.optimizations.bundle.summary) {
          results.summary.codeReduction += results.optimizations.bundle.summary.reduction || 0;
          results.summary.performanceGains += results.optimizations.bundle.summary.buildTime || 0;
        }
      }

      // 3. Tree Shaking
      if (options.treeShaking !== false) {
        logger.info('Executing tree shaking...');
        results.optimizations.treeShaking = await treeShakingEngine.executeTreeShaking(
          options.entryPoints || ['src/server.js'],
          options.outputPath || 'dist/tree-shaken'
        );
        
        if (results.optimizations.treeShaking.summary) {
          results.summary.codeReduction += results.optimizations.treeShaking.summary.reduction || 0;
        }
      }

      // 4. Async/Await Optimization
      if (options.asyncOptimization !== false) {
        logger.info('Executing async/await optimization...');
        const sourceFiles = await this.getSourceFiles();
        results.optimizations.asyncAwait = await asyncAwaitOptimizer.optimizeAsyncPatterns(sourceFiles);
        
        if (results.optimizations.asyncAwait.summary) {
          results.summary.performanceGains += results.optimizations.asyncAwait.summary.estimatedPerformanceGain || 0;
        }
      }

      // 5. Memory Leak Prevention
      if (options.memoryOptimization !== false) {
        logger.info('Starting memory leak prevention...');
        memoryLeakPrevention.startMemoryMonitoring();
        results.optimizations.memoryLeak = {
          monitoringStarted: true,
          preventionStrategies: memoryLeakPrevention.generateMemoryOptimizationRecommendations()
        };
        results.summary.memoryImprovement = 1; // Indicator that memory monitoring is active
      }

      results.completedAt = new Date();
      results.duration = results.completedAt - results.startedAt;

      // Generate comprehensive report
      const report = await this.generateComprehensiveReport(results);

      // Store optimization history
      this.storeOptimizationHistory(results);

      // Generate recommendations
      const recommendations = await this.generateOptimizationRecommendations(results);
      report.recommendations = recommendations;

      // Calculate final metrics
      results.summary = await this.calculateFinalMetrics(results);

      logger.info('Comprehensive code optimization completed', {
        duration: results.duration,
        totalOptimizations: results.summary.totalOptimizations,
        estimatedSavings: results.summary.estimatedSavings,
        codeReduction: results.summary.codeReduction
      });

      return report;

    } catch (error) {
      logger.error('Comprehensive code optimization failed:', error);
      throw error;
    }
  }

  /**
   * Get all source files for optimization
   */
  async getSourceFiles() {
    const patterns = [
      'src/**/*.js',
      'src/**/*.jsx',
      'src/**/*.ts',
      'src/**/*.tsx'
    ];

    const excludePatterns = [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '**/*.test.js',
      '**/*.spec.js',
      '**/*.min.js'
    ];

    let files = [];

    for (const pattern of patterns) {
      const patternFiles = glob.sync(pattern, { ignore: excludePatterns });
      files = files.concat(patternFiles);
    }

    // Remove duplicates
    files = [...new Set(files)];

    logger.debug(`Found ${files.length} source files for optimization`);
    return files;
  }

  /**
   * Capture performance baseline
   */
  async capturePerformanceBaseline() {
    const baseline = {
      timestamp: new Date(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      codebaseStats: await this.getCodebaseStatistics()
    };

    this.performanceBaseline = baseline;
    return baseline;
  }

  /**
   * Get codebase statistics
   */
  async getCodebaseStatistics() {
    const sourceFiles = await this.getSourceFiles();
    let totalSize = 0;
    let totalLines = 0;
    let fileCount = sourceFiles.length;

    for (const file of sourceFiles) {
      try {
        const stats = await fs.stat(file);
        const content = await fs.readFile(file, 'utf-8');
        
        totalSize += stats.size;
        totalLines += content.split('\n').length;
      } catch (error) {
        logger.warn(`Failed to analyze file ${file}:`, error.message);
      }
    }

    return {
      fileCount,
      totalSize,
      totalLines,
      averageFileSize: totalSize / fileCount,
      averageLinesPerFile: totalLines / fileCount
    };
  }

  /**
   * Generate comprehensive optimization report
   */
  async generateComprehensiveReport(results) {
    const report = {
      generatedAt: new Date(),
      optimizationId: this.generateOptimizationId(),
      duration: results.duration,
      baseline: results.baseline,
      
      // Executive Summary
      executiveSummary: {
        totalOptimizationsApplied: results.summary.totalOptimizations,
        estimatedSavings: results.summary.estimatedSavings,
        codeReductionBytes: results.summary.codeReduction,
        performanceGainMs: results.summary.performanceGains,
        memoryOptimizationEnabled: !!results.summary.memoryImprovement,
        overallGrade: this.calculateOverallGrade(results.summary)
      },

      // Detailed Results
      optimizationResults: {
        deadCodeElimination: this.formatDeadCodeResults(results.optimizations.deadCode),
        bundleOptimization: this.formatBundleResults(results.optimizations.bundle),
        treeShaking: this.formatTreeShakingResults(results.optimizations.treeShaking),
        asyncAwaitOptimization: this.formatAsyncAwaitResults(results.optimizations.asyncAwait),
        memoryLeakPrevention: this.formatMemoryResults(results.optimizations.memoryLeak)
      },

      // Performance Comparison
      performanceComparison: await this.generatePerformanceComparison(results),

      // Optimization Metrics
      metrics: {
        beforeOptimization: results.baseline.codebaseStats,
        afterOptimization: await this.estimatePostOptimizationStats(results),
        improvement: this.calculateImprovementMetrics(results)
      },

      // Next Steps
      nextSteps: this.generateNextSteps(results)
    };

    // Save report to file
    await this.saveOptimizationReport(report);

    return report;
  }

  /**
   * Calculate final optimization metrics
   */
  async calculateFinalMetrics(results) {
    const metrics = {
      totalOptimizations: 0,
      estimatedSavings: 0,
      performanceGains: 0,
      codeReduction: 0,
      memoryImprovement: 0,
      optimizationEffectiveness: 0
    };

    // Dead code metrics
    if (results.optimizations.deadCode) {
      metrics.totalOptimizations += results.optimizations.deadCode.summary?.totalFiles || 0;
      metrics.estimatedSavings += results.optimizations.deadCode.summary?.estimatedSavings || 0;
    }

    // Bundle optimization metrics
    if (results.optimizations.bundle) {
      metrics.codeReduction += results.optimizations.bundle.summary?.reduction || 0;
      metrics.performanceGains += results.optimizations.bundle.summary?.buildTime || 0;
    }

    // Tree shaking metrics
    if (results.optimizations.treeShaking) {
      metrics.codeReduction += results.optimizations.treeShaking.summary?.reduction || 0;
    }

    // Async/await metrics
    if (results.optimizations.asyncAwait) {
      metrics.performanceGains += results.optimizations.asyncAwait.summary?.estimatedPerformanceGain || 0;
    }

    // Memory optimization metrics
    if (results.optimizations.memoryLeak) {
      metrics.memoryImprovement = results.optimizations.memoryLeak.monitoringStarted ? 1 : 0;
    }

    // Calculate overall effectiveness
    const baselineSize = results.baseline.codebaseStats.totalSize;
    metrics.optimizationEffectiveness = baselineSize > 0 ? 
      (metrics.codeReduction / baselineSize) * 100 : 0;

    return metrics;
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizationRecommendations(results) {
    const recommendations = {
      immediate: [],
      shortTerm: [],
      longTerm: [],
      monitoring: []
    };

    // Dead code recommendations
    if (results.optimizations.deadCode?.summary?.unusedFiles > 0) {
      recommendations.immediate.push({
        type: 'REMOVE_DEAD_CODE',
        priority: 'HIGH',
        description: `Remove ${results.optimizations.deadCode.summary.unusedFiles} unused files`,
        estimatedSaving: results.optimizations.deadCode.summary.estimatedSavings,
        effort: 'LOW'
      });
    }

    // Bundle optimization recommendations
    if (results.optimizations.bundle?.summary?.reductionPercentage < 30) {
      recommendations.shortTerm.push({
        type: 'IMPROVE_BUNDLE_SPLITTING',
        priority: 'MEDIUM',
        description: 'Implement more aggressive code splitting strategies',
        estimatedSaving: 'TBD',
        effort: 'MEDIUM'
      });
    }

    // Tree shaking recommendations
    if (results.optimizations.treeShaking?.summary?.reductionPercentage < 20) {
      recommendations.shortTerm.push({
        type: 'IMPROVE_TREE_SHAKING',
        priority: 'MEDIUM',
        description: 'Optimize ES6 module usage for better tree shaking',
        estimatedSaving: 'TBD',
        effort: 'MEDIUM'
      });
    }

    // Async/await recommendations
    if (results.optimizations.asyncAwait?.optimizationsFound > 10) {
      recommendations.immediate.push({
        type: 'OPTIMIZE_ASYNC_PATTERNS',
        priority: 'HIGH',
        description: `Optimize ${results.optimizations.asyncAwait.optimizationsFound} async/await patterns`,
        estimatedSaving: `${results.optimizations.asyncAwait.summary?.estimatedPerformanceGain || 0}ms`,
        effort: 'MEDIUM'
      });
    }

    // Memory optimization recommendations
    if (results.optimizations.memoryLeak?.monitoringStarted) {
      recommendations.monitoring.push({
        type: 'MONITOR_MEMORY_USAGE',
        priority: 'ONGOING',
        description: 'Continue monitoring for memory leaks and optimize based on findings',
        estimatedSaving: 'Variable',
        effort: 'ONGOING'
      });
    }

    // Long-term architectural recommendations
    recommendations.longTerm.push({
      type: 'IMPLEMENT_MICRO_FRONTENDS',
      priority: 'LOW',
      description: 'Consider micro-frontend architecture for better code splitting',
      estimatedSaving: 'Variable',
      effort: 'HIGH'
    });

    return recommendations;
  }

  /**
   * Generate performance comparison
   */
  async generatePerformanceComparison(results) {
    const comparison = {
      codeSize: {
        before: results.baseline.codebaseStats.totalSize,
        after: results.baseline.codebaseStats.totalSize - (results.summary.codeReduction || 0),
        improvement: `${((results.summary.codeReduction / results.baseline.codebaseStats.totalSize) * 100).toFixed(2)}%`
      },
      bundleSize: {
        before: results.optimizations.bundle?.baseline?.totalSize || 0,
        after: results.optimizations.bundle?.optimized?.totalSize || 0,
        improvement: results.optimizations.bundle?.summary?.reductionPercentage || 0
      },
      buildTime: {
        before: results.baseline.timestamp,
        after: results.completedAt,
        improvement: `${results.duration}ms faster optimization pipeline`
      },
      memoryUsage: {
        before: results.baseline.memoryUsage,
        monitoring: results.optimizations.memoryLeak?.monitoringStarted || false
      }
    };

    return comparison;
  }

  /**
   * Store optimization history
   */
  storeOptimizationHistory(results) {
    this.optimizationHistory.push({
      id: this.generateOptimizationId(),
      timestamp: results.startedAt,
      duration: results.duration,
      summary: results.summary,
      baseline: results.baseline
    });

    // Keep only last 50 optimization runs
    if (this.optimizationHistory.length > 50) {
      this.optimizationHistory = this.optimizationHistory.slice(-50);
    }
  }

  /**
   * Get optimization trends
   */
  getOptimizationTrends() {
    if (this.optimizationHistory.length < 2) {
      return { trends: 'insufficient_data' };
    }

    const trends = {
      codeReductionTrend: this.calculateTrend('codeReduction'),
      performanceTrend: this.calculateTrend('performanceGains'),
      optimizationCountTrend: this.calculateTrend('totalOptimizations')
    };

    return trends;
  }

  /**
   * Execute optimization in CI/CD pipeline
   */
  async executeInPipeline(pipelineConfig = {}) {
    try {
      const options = {
        deadCode: pipelineConfig.enableDeadCodeRemoval !== false,
        bundleOptimization: pipelineConfig.enableBundleOptimization !== false,
        treeShaking: pipelineConfig.enableTreeShaking !== false,
        asyncOptimization: pipelineConfig.enableAsyncOptimization !== false,
        memoryOptimization: pipelineConfig.enableMemoryOptimization !== false,
        ...pipelineConfig.optimizationOptions
      };

      const results = await this.executeCompleteOptimization(options);

      // Generate CI/CD specific report
      const ciReport = this.generateCIPipelineReport(results, pipelineConfig);

      // Set exit code based on results
      if (pipelineConfig.failOnThreshold) {
        const shouldFail = this.checkFailureThresholds(results, pipelineConfig.failOnThreshold);
        if (shouldFail) {
          throw new Error('Optimization thresholds not met');
        }
      }

      return ciReport;

    } catch (error) {
      logger.error('Pipeline optimization failed:', error);
      throw error;
    }
  }

  // Helper methods
  generateOptimizationId() {
    return `opt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  calculateOverallGrade(summary) {
    let score = 0;
    let maxScore = 0;

    // Code reduction score (0-30 points)
    if (summary.codeReduction > 0) {
      score += Math.min((summary.codeReduction / 1024 / 1024) * 10, 30); // 10 points per MB
    }
    maxScore += 30;

    // Performance gains score (0-25 points)
    if (summary.performanceGains > 0) {
      score += Math.min((summary.performanceGains / 1000) * 5, 25); // 5 points per second
    }
    maxScore += 25;

    // Optimization count score (0-25 points)
    score += Math.min(summary.totalOptimizations * 2, 25); // 2 points per optimization
    maxScore += 25;

    // Memory optimization score (0-20 points)
    if (summary.memoryImprovement > 0) {
      score += 20;
    }
    maxScore += 20;

    const percentage = (score / maxScore) * 100;

    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C+';
    if (percentage >= 40) return 'C';
    return 'D';
  }

  formatDeadCodeResults(results) {
    if (!results) return null;
    
    return {
      filesAnalyzed: results.summary?.totalFiles || 0,
      unusedFiles: results.summary?.unusedFiles || 0,
      unusedExports: results.summary?.unusedExports || 0,
      estimatedSavings: results.summary?.estimatedSavings || 0,
      topFindings: results.findings?.slice(0, 5) || []
    };
  }

  formatBundleResults(results) {
    if (!results) return null;
    
    return {
      originalSize: results.summary?.originalSize || 0,
      optimizedSize: results.summary?.optimizedSize || 0,
      reduction: results.summary?.reduction || 0,
      reductionPercentage: results.summary?.reductionPercentage || 0,
      buildTime: results.summary?.buildTime || 0
    };
  }

  formatTreeShakingResults(results) {
    if (!results) return null;
    
    return {
      totalModules: results.summary?.totalModules || 0,
      shakeableModules: results.summary?.shakeableModules || 0,
      originalSize: results.summary?.originalSize || 0,
      shakenSize: results.summary?.shakenSize || 0,
      reduction: results.summary?.reduction || 0,
      reductionPercentage: results.summary?.reductionPercentage || 0
    };
  }

  formatAsyncAwaitResults(results) {
    if (!results) return null;
    
    return {
      filesAnalyzed: results.filesAnalyzed || 0,
      optimizationsFound: results.optimizationsFound || 0,
      estimatedPerformanceGain: results.performanceGains ? 
        Object.values(results.performanceGains).reduce((sum, gain) => sum + gain, 0) : 0,
      topRecommendations: results.recommendations?.slice(0, 5) || []
    };
  }

  formatMemoryResults(results) {
    if (!results) return null;
    
    return {
      monitoringEnabled: results.monitoringStarted || false,
      preventionStrategiesAvailable: !!results.preventionStrategies,
      bestPracticesCount: results.preventionStrategies?.bestPractices?.length || 0,
      antiPatternsIdentified: results.preventionStrategies?.antiPatterns?.length || 0
    };
  }

  async estimatePostOptimizationStats(results) {
    const baseline = results.baseline.codebaseStats;
    
    return {
      fileCount: baseline.fileCount - (results.optimizations.deadCode?.summary?.unusedFiles || 0),
      totalSize: baseline.totalSize - (results.summary.codeReduction || 0),
      totalLines: baseline.totalLines, // Estimated, would need actual calculation
      averageFileSize: (baseline.totalSize - (results.summary.codeReduction || 0)) / baseline.fileCount,
      averageLinesPerFile: baseline.averageLinesPerFile // Estimated
    };
  }

  calculateImprovementMetrics(results) {
    const baseline = results.baseline.codebaseStats;
    const reduction = results.summary.codeReduction || 0;
    
    return {
      sizeReduction: reduction,
      sizeReductionPercentage: baseline.totalSize > 0 ? (reduction / baseline.totalSize) * 100 : 0,
      performanceGain: results.summary.performanceGains || 0,
      optimizationEffectiveness: results.summary.optimizationEffectiveness || 0
    };
  }

  generateNextSteps(results) {
    const steps = [];
    
    if (results.optimizations.deadCode?.summary?.unusedFiles > 0) {
      steps.push('Remove identified unused files');
    }
    
    if (results.optimizations.bundle?.summary?.reductionPercentage < 30) {
      steps.push('Implement more aggressive bundle splitting');
    }
    
    if (results.optimizations.asyncAwait?.optimizationsFound > 0) {
      steps.push('Apply async/await optimizations');
    }
    
    steps.push('Monitor memory usage continuously');
    steps.push('Set up automated optimization in CI/CD pipeline');
    
    return steps;
  }

  calculateTrend(metric) {
    if (this.optimizationHistory.length < 2) return 'stable';
    
    const recent = this.optimizationHistory.slice(-5);
    const values = recent.map(run => run.summary[metric] || 0);
    
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const lastValue = values[values.length - 1];
    
    if (lastValue > average * 1.1) return 'improving';
    if (lastValue < average * 0.9) return 'declining';
    return 'stable';
  }

  generateCIPipelineReport(results, pipelineConfig) {
    return {
      status: 'success',
      optimizationId: results.optimizationId,
      summary: results.summary,
      recommendations: results.recommendations?.immediate || [],
      metrics: {
        codeReduction: results.summary.codeReduction,
        performanceGain: results.summary.performanceGains,
        optimizationsApplied: results.summary.totalOptimizations
      },
      artifacts: {
        reportPath: `reports/optimization-${results.optimizationId}.json`,
        optimizedAssets: results.optimizations.bundle?.outputPath
      }
    };
  }

  checkFailureThresholds(results, thresholds) {
    if (thresholds.minCodeReduction && results.summary.codeReduction < thresholds.minCodeReduction) {
      return true;
    }
    
    if (thresholds.minPerformanceGain && results.summary.performanceGains < thresholds.minPerformanceGain) {
      return true;
    }
    
    if (thresholds.minOptimizations && results.summary.totalOptimizations < thresholds.minOptimizations) {
      return true;
    }
    
    return false;
  }

  async saveOptimizationReport(report) {
    const reportsDir = 'reports/comprehensive-optimization';
    await fs.mkdir(reportsDir, { recursive: true });
    
    const reportFile = path.join(reportsDir, `optimization-${report.optimizationId}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    // Also save a summary report
    const summaryFile = path.join(reportsDir, 'latest-summary.json');
    await fs.writeFile(summaryFile, JSON.stringify({
      optimizationId: report.optimizationId,
      generatedAt: report.generatedAt,
      executiveSummary: report.executiveSummary,
      recommendations: report.recommendations
    }, null, 2));
    
    logger.info(`Comprehensive optimization report saved: ${reportFile}`);
  }
}

// Export singleton instance
export const unifiedCodeOptimizer = new UnifiedCodeOptimizer();
