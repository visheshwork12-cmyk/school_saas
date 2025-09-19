// src/infrastructure/optimization/bundle-optimizer.js
import webpack from "webpack";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import TerserPlugin from "terser-webpack-plugin";
import CompressionPlugin from "compression-webpack-plugin";
import { logger } from "#utils/core/logger.js";
import fs from "fs/promises";
import path from "path";

/**
 * Bundle Size Optimization Manager
 * Optimizes JavaScript bundles for minimal size and maximum performance
 */
export class BundleOptimizer {
  constructor() {
    this.optimizationStrategies = new Map();
    this.bundleStats = new Map();
    this.optimizationConfig = this.getOptimizationConfig();
    this.initializeStrategies();
  }

  /**
   * Get optimization configuration
   */
  getOptimizationConfig() {
    return {
      // Code splitting thresholds
      minChunkSize: 20000, // 20KB
      maxChunkSize: 244000, // 244KB
      maxAsyncRequests: 30,
      maxInitialRequests: 30,
      
      // Compression settings
      compressionThreshold: 10240, // 10KB
      compressionRatio: 0.8,
      
      // Bundle analysis
      analyzeBundle: process.env.ANALYZE_BUNDLE === 'true',
      generateReport: true,
      
      // Optimization levels
      level: process.env.OPTIMIZATION_LEVEL || 'production' // development, production, aggressive
    };
  }

  /**
   * Initialize optimization strategies
   */
  initializeStrategies() {
    // Code splitting strategy
    this.addOptimizationStrategy('CODE_SPLITTING', {
      name: 'Code Splitting Optimization',
      execute: this.optimizeCodeSplitting.bind(this),
      priority: 1
    });

    // Tree shaking strategy
    this.addOptimizationStrategy('TREE_SHAKING', {
      name: 'Tree Shaking Optimization',
      execute: this.optimizeTreeShaking.bind(this),
      priority: 2
    });

    // Minification strategy
    this.addOptimizationStrategy('MINIFICATION', {
      name: 'Minification Optimization',
      execute: this.optimizeMinification.bind(this),
      priority: 3
    });

    // Compression strategy
    this.addOptimizationStrategy('COMPRESSION', {
      name: 'Compression Optimization',
      execute: this.optimizeCompression.bind(this),
      priority: 4
    });

    // Dependency optimization
    this.addOptimizationStrategy('DEPENDENCIES', {
      name: 'Dependency Optimization',
      execute: this.optimizeDependencies.bind(this),
      priority: 5
    });
  }

  /**
   * Execute comprehensive bundle optimization
   */
  async optimizeBundles(entryPoints, outputPath) {
    try {
      logger.info('Starting bundle optimization');

      const baselineStats = await this.measureBaseline(entryPoints);
      
      // Create optimized webpack configuration
      const optimizedConfig = await this.createOptimizedConfig(entryPoints, outputPath);
      
      // Execute webpack build
      const buildStats = await this.executeBuild(optimizedConfig);
      
      // Analyze results
      const analysis = await this.analyzeBuildResults(buildStats, baselineStats);
      
      // Generate optimization report
      const report = await this.generateOptimizationReport(analysis);
      
      logger.info('Bundle optimization completed', {
        sizeBefore: baselineStats.totalSize,
        sizeAfter: analysis.totalSize,
        reduction: analysis.sizeReduction
      });

      return report;

    } catch (error) {
      logger.error('Bundle optimization failed:', error);
      throw error;
    }
  }

  /**
   * Create optimized webpack configuration
   */
  async createOptimizedConfig(entryPoints, outputPath) {
    const config = {
      mode: 'production',
      entry: entryPoints,
      output: {
        path: outputPath,
        filename: '[name].[contenthash].js',
        chunkFilename: '[name].[contenthash].chunk.js',
        clean: true
      },
      
      // Optimization settings
      optimization: {
        minimize: true,
        minimizer: [
          new TerserPlugin({
            terserOptions: {
              compress: {
                drop_console: this.optimizationConfig.level === 'aggressive',
                drop_debugger: true,
                pure_funcs: ['console.log', 'console.info'],
                passes: this.optimizationConfig.level === 'aggressive' ? 3 : 2
              },
              mangle: {
                safari10: true
              },
              format: {
                comments: false
              }
            },
            extractComments: false
          })
        ],
        
        // Code splitting configuration
        splitChunks: {
          chunks: 'all',
          minSize: this.optimizationConfig.minChunkSize,
          maxSize: this.optimizationConfig.maxChunkSize,
          maxAsyncRequests: this.optimizationConfig.maxAsyncRequests,
          maxInitialRequests: this.optimizationConfig.maxInitialRequests,
          
          cacheGroups: {
            // Vendor libraries
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              priority: 20,
              reuseExistingChunk: true
            },
            
            // Common shared code
            common: {
              minChunks: 2,
              priority: 10,
              reuseExistingChunk: true,
              enforce: true
            },
            
            // Framework code (React, Vue, etc.)
            framework: {
              test: /[\\/]node_modules[\\/](react|react-dom|vue|@vue)[\\/]/,
              name: 'framework',
              priority: 40,
              reuseExistingChunk: true
            },
            
            // Utility libraries
            utils: {
              test: /[\\/]node_modules[\\/](lodash|moment|date-fns|axios)[\\/]/,
              name: 'utils',
              priority: 30,
              reuseExistingChunk: true
            }
          }
        },
        
        // Runtime chunk optimization
        runtimeChunk: {
          name: 'runtime'
        },
        
        // Tree shaking
        usedExports: true,
        sideEffects: false
      },
      
      // Module resolution
      resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        alias: {
          // Add aliases for commonly used modules
          '@': path.resolve(process.cwd(), 'src'),
          '#shared': path.resolve(process.cwd(), 'src/shared'),
          '#utils': path.resolve(process.cwd(), 'src/shared/utils'),
          '#config': path.resolve(process.cwd(), 'src/shared/config')
        }
      },
      
      // Module rules
      module: {
        rules: [
          {
            test: /\.js$/,
            exclude: /node_modules/,
            use: {
              loader: 'babel-loader',
              options: {
                presets: [
                  ['@babel/preset-env', {
                    targets: {
                      browsers: ['> 1%', 'last 2 versions', 'not ie <= 8']
                    },
                    modules: false, // Important for tree shaking
                    useBuiltIns: 'usage',
                    corejs: 3
                  }]
                ],
                plugins: [
                  '@babel/plugin-syntax-dynamic-import',
                  '@babel/plugin-proposal-class-properties'
                ]
              }
            }
          }
        ]
      },
      
      // Plugins
      plugins: [
        // Compression
        new CompressionPlugin({
          filename: '[path][base].gz',
          algorithm: 'gzip',
          test: /\.(js|css|html|svg)$/,
          threshold: this.optimizationConfig.compressionThreshold,
          minRatio: this.optimizationConfig.compressionRatio
        })
      ]
    };

    // Add bundle analyzer if enabled
    if (this.optimizationConfig.analyzeBundle) {
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          openAnalyzer: false,
          reportFilename: 'bundle-analysis.html'
        })
      );
    }

    return config;
  }

  /**
   * Execute webpack build
   */
  async executeBuild(config) {
    return new Promise((resolve, reject) => {
      webpack(config, (err, stats) => {
        if (err || stats.hasErrors()) {
          const error = err || new Error('Webpack build failed');
          logger.error('Webpack build error:', error);
          reject(error);
          return;
        }

        resolve(stats);
      });
    });
  }

  /**
   * Optimize code splitting
   */
  async optimizeCodeSplitting(config) {
    // Dynamic import optimization
    const dynamicImports = await this.identifyDynamicImportOpportunities();
    
    // Route-based splitting
    const routeSplitting = await this.optimizeRouteSplitting();
    
    // Component-level splitting
    const componentSplitting = await this.optimizeComponentSplitting();
    
    return {
      dynamicImports,
      routeSplitting,
      componentSplitting,
      estimatedSavings: this.calculateSplittingSavings(dynamicImports, routeSplitting)
    };
  }

  /**
   * Optimize tree shaking
   */
  async optimizeTreeShaking(config) {
    const optimizations = [];
    
    // Ensure ES6 module syntax
    optimizations.push(await this.ensureES6Modules());
    
    // Optimize sideEffects in package.json
    optimizations.push(await this.optimizeSideEffects());
    
    // Remove unused exports
    optimizations.push(await this.removeUnusedExports());
    
    return {
      optimizations,
      estimatedReduction: this.calculateTreeShakingSavings(optimizations)
    };
  }

  /**
   * Optimize dependencies
   */
  async optimizeDependencies() {
    const analysis = {
      duplicates: [],
      alternatives: [],
      unused: [],
      heavy: []
    };

    // Find duplicate dependencies
    analysis.duplicates = await this.findDuplicateDependencies();
    
    // Find lighter alternatives
    analysis.alternatives = await this.findLighterAlternatives();
    
    // Find unused dependencies
    analysis.unused = await this.findUnusedDependencies();
    
    // Find heavy dependencies
    analysis.heavy = await this.findHeavyDependencies();
    
    return analysis;
  }

  /**
   * Measure baseline bundle sizes
   */
  async measureBaseline(entryPoints) {
    // Create basic webpack config for baseline measurement
    const baseConfig = {
      mode: 'development',
      entry: entryPoints,
      output: {
        path: path.resolve(process.cwd(), 'dist/baseline'),
        filename: '[name].js'
      }
    };

    const stats = await this.executeBuild(baseConfig);
    return this.extractBundleStats(stats);
  }

  /**
   * Extract bundle statistics
   */
  extractBundleStats(stats) {
    const statsJson = stats.toJson();
    
    return {
      totalSize: statsJson.assets.reduce((sum, asset) => sum + asset.size, 0),
      assets: statsJson.assets.map(asset => ({
        name: asset.name,
        size: asset.size,
        chunks: asset.chunks
      })),
      chunks: statsJson.chunks.map(chunk => ({
        id: chunk.id,
        size: chunk.size,
        modules: chunk.modules?.length || 0
      })),
      modules: statsJson.modules?.length || 0,
      buildTime: stats.endTime - stats.startTime
    };
  }

  /**
   * Generate comprehensive optimization report
   */
  async generateOptimizationReport(analysis) {
    const report = {
      generatedAt: new Date(),
      summary: {
        originalSize: analysis.baseline.totalSize,
        optimizedSize: analysis.optimized.totalSize,
        reduction: analysis.baseline.totalSize - analysis.optimized.totalSize,
        reductionPercentage: ((analysis.baseline.totalSize - analysis.optimized.totalSize) / analysis.baseline.totalSize) * 100,
        buildTime: analysis.optimized.buildTime
      },
      optimizations: [],
      recommendations: [],
      assets: analysis.optimized.assets,
      chunks: analysis.optimized.chunks
    };

    // Add optimization details
    for (const [strategyId, result] of this.bundleStats) {
      if (result.executed) {
        report.optimizations.push({
          strategy: strategyId,
          result: result.data,
          savings: result.savings || 0
        });
      }
    }

    // Generate recommendations
    report.recommendations = await this.generateOptimizationRecommendations(analysis);

    // Save report
    await this.saveOptimizationReport(report);

    return report;
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizationRecommendations(analysis) {
    const recommendations = [];

    // Large bundle recommendations
    const largeBundles = analysis.optimized.assets.filter(asset => asset.size > 500000);
    if (largeBundles.length > 0) {
      recommendations.push({
        type: 'LARGE_BUNDLES',
        message: `${largeBundles.length} bundles are larger than 500KB`,
        priority: 'HIGH',
        suggestion: 'Consider further code splitting or lazy loading',
        assets: largeBundles.map(b => b.name)
      });
    }

    // Duplicate code recommendations
    if (analysis.duplicateCode && analysis.duplicateCode.length > 0) {
      recommendations.push({
        type: 'DUPLICATE_CODE',
        message: 'Duplicate code detected across bundles',
        priority: 'MEDIUM',
        suggestion: 'Extract common code into shared chunks',
        duplicates: analysis.duplicateCode
      });
    }

    // Heavy dependencies
    const heavyDeps = analysis.dependencies?.heavy || [];
    if (heavyDeps.length > 0) {
      recommendations.push({
        type: 'HEAVY_DEPENDENCIES',
        message: `${heavyDeps.length} heavy dependencies found`,
        priority: 'MEDIUM',
        suggestion: 'Consider lighter alternatives or dynamic imports',
        dependencies: heavyDeps
      });
    }

    return recommendations;
  }

  // Helper methods
  addOptimizationStrategy(strategyId, strategy) {
    this.optimizationStrategies.set(strategyId, strategy);
  }

  async identifyDynamicImportOpportunities() {
    // Analyze code to find opportunities for dynamic imports
    return [];
  }

  async optimizeRouteSplitting() {
    // Implement route-based code splitting optimization
    return { routes: 0, savings: 0 };
  }

  async optimizeComponentSplitting() {
    // Implement component-level code splitting
    return { components: 0, savings: 0 };
  }

  calculateSplittingSavings(dynamicImports, routeSplitting) {
    return dynamicImports.savings + routeSplitting.savings;
  }

  async ensureES6Modules() {
    return { converted: 0, files: [] };
  }

  async optimizeSideEffects() {
    return { optimized: true, packages: [] };
  }

  async removeUnusedExports() {
    return { removed: 0, files: [] };
  }

  calculateTreeShakingSavings(optimizations) {
    return optimizations.reduce((sum, opt) => sum + (opt.savings || 0), 0);
  }

  async findDuplicateDependencies() {
    return [];
  }

  async findLighterAlternatives() {
    return [];
  }

  async findUnusedDependencies() {
    return [];
  }

  async findHeavyDependencies() {
    return [];
  }

  async saveOptimizationReport(report) {
    const reportsDir = 'reports/bundle-optimization';
    await fs.mkdir(reportsDir, { recursive: true });
    
    const reportFile = path.join(reportsDir, `bundle-optimization-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    logger.info(`Bundle optimization report saved: ${reportFile}`);
  }
}

// Export singleton instance
export const bundleOptimizer = new BundleOptimizer();
