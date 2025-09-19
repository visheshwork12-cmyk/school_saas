// src/infrastructure/optimization/tree-shaking-engine.js
import { logger } from "#utils/core/logger.js";
import { deadCodeAnalyzer } from "./dead-code-analyzer.js";
import fs from "fs/promises";
import path from "path";
import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";
import babel from "@rollup/plugin-babel";

/**
 * Advanced Tree Shaking Engine
 * Implements sophisticated tree shaking with ES6 module analysis
 */
export class TreeShakingEngine {
  constructor() {
    this.moduleGraph = new Map();
    this.exportUsageMap = new Map();
    this.sideEffectMap = new Map();
    this.shakeableModules = new Set();
    this.config = this.getTreeShakingConfig();
  }

  /**
   * Get tree shaking configuration
   */
  getTreeShakingConfig() {
    return {
      // Analysis settings
      aggressiveMode: process.env.TREE_SHAKING_AGGRESSIVE === 'true',
      preserveComments: false,
      analyzeNodeModules: true,
      
      // Babel settings for ES6 module preservation
      babelConfig: {
        presets: [
          ['@babel/preset-env', {
            modules: false, // Preserve ES6 modules for tree shaking
            targets: {
              browsers: ['> 1%', 'last 2 versions']
            }
          }]
        ],
        plugins: [
          '@babel/plugin-syntax-dynamic-import',
          '@babel/plugin-proposal-optional-chaining'
        ]
      },

      // Rollup configuration for tree shaking
      rollupConfig: {
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
          unknownGlobalSideEffects: false
        }
      }
    };
  }

  /**
   * Execute comprehensive tree shaking
   */
  async executeTreeShaking(entryPoints, outputDir) {
    try {
      logger.info('Starting advanced tree shaking analysis');

      // Build module dependency graph
      await this.buildModuleGraph(entryPoints);
      
      // Analyze export usage
      await this.analyzeExportUsage();
      
      // Identify side effects
      await this.analyzeSideEffects();
      
      // Mark shakeable modules
      await this.markShakeableModules();
      
      // Execute tree shaking with Rollup
      const shakeResults = await this.executeRollupTreeShaking(entryPoints, outputDir);
      
      // Generate tree shaking report
      const report = await this.generateTreeShakingReport(shakeResults);
      
      logger.info('Tree shaking completed', {
        originalSize: shakeResults.originalSize,
        shakenSize: shakeResults.shakenSize,
        reduction: shakeResults.reduction
      });

      return report;

    } catch (error) {
      logger.error('Tree shaking failed:', error);
      throw error;
    }
  }

  /**
   * Build module dependency graph
   */
  async buildModuleGraph(entryPoints) {
    for (const entryPoint of entryPoints) {
      await this.analyzeModuleDependencies(entryPoint, new Set());
    }
    
    logger.debug(`Module graph built with ${this.moduleGraph.size} modules`);
  }

  /**
   * Analyze module dependencies recursively
   */
  async analyzeModuleDependencies(modulePath, visited) {
    if (visited.has(modulePath)) return;
    visited.add(modulePath);

    try {
      const moduleInfo = await this.analyzeModule(modulePath);
      this.moduleGraph.set(modulePath, moduleInfo);

      // Recursively analyze dependencies
      for (const dependency of moduleInfo.dependencies) {
        const resolvedPath = await this.resolveModule(dependency, modulePath);
        if (resolvedPath) {
          await this.analyzeModuleDependencies(resolvedPath, visited);
        }
      }

    } catch (error) {
      logger.warn(`Failed to analyze module ${modulePath}:`, error.message);
    }
  }

  /**
   * Analyze individual module
   */
  async analyzeModule(modulePath) {
    const content = await fs.readFile(modulePath, 'utf-8');
    
    return {
      path: modulePath,
      exports: this.extractExports(content),
      imports: this.extractImports(content),
      dependencies: this.extractDependencies(content),
      sideEffects: this.detectSideEffects(content),
      size: content.length,
      isES6Module: this.isES6Module(content)
    };
  }

  /**
   * Extract exports from module content
   */
  extractExports(content) {
    const exports = {
      named: [],
      default: null,
      namespace: false
    };

    // Named exports
    const namedExportMatches = content.matchAll(/export\s+(?:const|let|var|function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
    for (const match of namedExportMatches) {
      exports.named.push(match[1]);
    }

    // Export statements
    const exportStatementMatches = content.matchAll(/export\s+\{\s*([^}]+)\s*\}/g);
    for (const match of exportStatementMatches) {
      const exportNames = match[1].split(',').map(name => name.trim().split(' as ')[0].trim());
      exports.named.push(...exportNames);
    }

    // Default export
    if (content.includes('export default')) {
      exports.default = true;
    }

    // Namespace export
    if (content.includes('export *')) {
      exports.namespace = true;
    }

    return exports;
  }

  /**
   * Extract imports from module content
   */
  extractImports(content) {
    const imports = [];

    // Import statements
    const importMatches = content.matchAll(/import\s+([^'"]*)\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      const specifiers = this.parseImportSpecifiers(match[1]);
      imports.push({
        source: match[2],
        specifiers
      });
    }

    // Dynamic imports
    const dynamicImportMatches = content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of dynamicImportMatches) {
      imports.push({
        source: match[1],
        dynamic: true,
        specifiers: { namespace: true }
      });
    }

    return imports;
  }

  /**
   * Parse import specifiers
   */
  parseImportSpecifiers(specifierString) {
    const specifiers = {
      default: null,
      named: [],
      namespace: null
    };

    if (!specifierString || !specifierString.trim()) {
      return specifiers;
    }

    const cleaned = specifierString.trim().replace(/[{}]/g, '');
    
    // Default import
    if (!cleaned.includes(',') && !cleaned.includes('*')) {
      specifiers.default = cleaned.trim();
      return specifiers;
    }

    // Namespace import
    if (cleaned.includes('* as ')) {
      const namespaceMatch = cleaned.match(/\*\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (namespaceMatch) {
        specifiers.namespace = namespaceMatch[1];
      }
      return specifiers;
    }

    // Named imports
    const parts = cleaned.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes(' as ')) {
        const [imported, local] = trimmed.split(' as ').map(s => s.trim());
        specifiers.named.push({ imported, local });
      } else {
        specifiers.named.push({ imported: trimmed, local: trimmed });
      }
    }

    return specifiers;
  }

  /**
   * Analyze export usage across modules
   */
  async analyzeExportUsage() {
    // Build usage map
    for (const [modulePath, moduleInfo] of this.moduleGraph) {
      for (const importInfo of moduleInfo.imports) {
        const exportingModule = await this.resolveModule(importInfo.source, modulePath);
        if (exportingModule && this.moduleGraph.has(exportingModule)) {
          this.markExportAsUsed(exportingModule, importInfo.specifiers);
        }
      }
    }
  }

  /**
   * Mark export as used
   */
  markExportAsUsed(modulePath, specifiers) {
    if (!this.exportUsageMap.has(modulePath)) {
      this.exportUsageMap.set(modulePath, {
        namedExports: new Set(),
        defaultUsed: false,
        namespaceUsed: false
      });
    }

    const usage = this.exportUsageMap.get(modulePath);

    if (specifiers.default) {
      usage.defaultUsed = true;
    }

    if (specifiers.namespace) {
      usage.namespaceUsed = true;
    }

    for (const named of specifiers.named || []) {
      usage.namedExports.add(named.imported);
    }
  }

  /**
   * Analyze side effects in modules
   */
  async analyzeSideEffects() {
    for (const [modulePath, moduleInfo] of this.moduleGraph) {
      const sideEffects = this.detectSideEffects(await fs.readFile(modulePath, 'utf-8'));
      this.sideEffectMap.set(modulePath, sideEffects);
    }
  }

  /**
   * Detect side effects in code
   */
  detectSideEffects(content) {
    const sideEffects = {
      hasGlobalModifications: false,
      hasTopLevelExecutions: false,
      hasPolyfills: false,
      hasStylesheets: false,
      score: 0
    };

    // Global variable modifications
    if (content.match(/window\.|global\.|globalThis\./)) {
      sideEffects.hasGlobalModifications = true;
      sideEffects.score += 10;
    }

    // Top level function calls (not in functions or classes)
    const topLevelCalls = content.match(/^(?!.*(?:function|class|=>|\{)).*\w+\s*\(/gm);
    if (topLevelCalls && topLevelCalls.length > 0) {
      sideEffects.hasTopLevelExecutions = true;
      sideEffects.score += 5;
    }

    // Polyfill imports
    if (content.includes('core-js') || content.includes('polyfill')) {
      sideEffects.hasPolyfills = true;
      sideEffects.score += 8;
    }

    // CSS or style imports
    if (content.match(/import\s+['"][^'"]*\.(css|scss|sass|less)['"]/) || 
        content.includes('require(') && content.includes('.css')) {
      sideEffects.hasStylesheets = true;
      sideEffects.score += 3;
    }

    return sideEffects;
  }

  /**
   * Mark modules as shakeable or non-shakeable
   */
  async markShakeableModules() {
    for (const [modulePath, moduleInfo] of this.moduleGraph) {
      const sideEffects = this.sideEffectMap.get(modulePath);
      const usage = this.exportUsageMap.get(modulePath);

      // Module is shakeable if:
      // 1. It has ES6 module syntax
      // 2. It has low side effect score
      // 3. Not all exports are used
      const isShakeable = 
        moduleInfo.isES6Module &&
        sideEffects.score < 5 &&
        this.hasUnusedExports(moduleInfo, usage);

      if (isShakeable) {
        this.shakeableModules.add(modulePath);
      }
    }

    logger.debug(`Marked ${this.shakeableModules.size} modules as shakeable`);
  }

  /**
   * Check if module has unused exports
   */
  hasUnusedExports(moduleInfo, usage) {
    if (!usage) return true;

    // Check if all named exports are used
    const unusedNamedExports = moduleInfo.exports.named.filter(
      exportName => !usage.namedExports.has(exportName)
    );

    return unusedNamedExports.length > 0 ||
           (moduleInfo.exports.default && !usage.defaultUsed);
  }

  /**
   * Execute tree shaking with Rollup
   */
  async executeRollupTreeShaking(entryPoints, outputDir) {
    const results = [];

    for (const entryPoint of entryPoints) {
      const originalSize = await this.getFileSize(entryPoint);
      
      // Create Rollup bundle
      const bundle = await rollup({
        input: entryPoint,
        plugins: [
          nodeResolve({
            preferBuiltins: false
          }),
          babel({
            ...this.config.babelConfig,
            babelHelpers: 'bundled',
            exclude: 'node_modules/**'
          }),
          terser({
            compress: {
              dead_code: true,
              drop_debugger: true,
              drop_console: this.config.aggressiveMode
            },
            mangle: true,
            format: {
              comments: this.config.preserveComments
            }
          })
        ],
        ...this.config.rollupConfig
      });

      // Generate output
      const outputPath = path.join(outputDir, path.basename(entryPoint));
      const { output } = await bundle.generate({
        format: 'es',
        file: outputPath
      });

      await bundle.write({
        format: 'es',
        file: outputPath
      });

      const shakenSize = output[0].code.length;
      
      results.push({
        entryPoint,
        originalSize,
        shakenSize,
        reduction: originalSize - shakenSize,
        reductionPercentage: ((originalSize - shakenSize) / originalSize) * 100,
        outputPath
      });

      await bundle.close();
    }

    return {
      results,
      originalSize: results.reduce((sum, r) => sum + r.originalSize, 0),
      shakenSize: results.reduce((sum, r) => sum + r.shakenSize, 0),
      reduction: results.reduce((sum, r) => sum + r.reduction, 0)
    };
  }

  /**
   * Generate tree shaking report
   */
  async generateTreeShakingReport(shakeResults) {
    const report = {
      generatedAt: new Date(),
      summary: {
        totalModules: this.moduleGraph.size,
        shakeableModules: this.shakeableModules.size,
        originalSize: shakeResults.originalSize,
        shakenSize: shakeResults.shakenSize,
        reduction: shakeResults.reduction,
        reductionPercentage: (shakeResults.reduction / shakeResults.originalSize) * 100
      },
      modules: [],
      sideEffectAnalysis: [],
      recommendations: []
    };

    // Module details
    for (const [modulePath, moduleInfo] of this.moduleGraph) {
      const usage = this.exportUsageMap.get(modulePath);
      const sideEffects = this.sideEffectMap.get(modulePath);
      
      report.modules.push({
        path: modulePath,
        size: moduleInfo.size,
        isShakeable: this.shakeableModules.has(modulePath),
        exports: moduleInfo.exports,
        usage: usage ? {
          namedExports: Array.from(usage.namedExports),
          defaultUsed: usage.defaultUsed,
          namespaceUsed: usage.namespaceUsed
        } : null,
        sideEffects: sideEffects.score,
        unusedExports: this.getUnusedExports(moduleInfo, usage)
      });
    }

    // Side effect analysis
    for (const [modulePath, sideEffects] of this.sideEffectMap) {
      if (sideEffects.score > 0) {
        report.sideEffectAnalysis.push({
          module: modulePath,
          score: sideEffects.score,
          effects: sideEffects
        });
      }
    }

    // Generate recommendations
    report.recommendations = this.generateTreeShakingRecommendations(report);

    // Save report
    await this.saveTreeShakingReport(report);

    return report;
  }

  // Helper methods
  extractDependencies(content) {
    const dependencies = [];
    const importMatches = content.matchAll(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g);
    
    for (const match of importMatches) {
      dependencies.push(match[1]);
    }
    
    return [...new Set(dependencies)];
  }

  isES6Module(content) {
    return content.includes('export ') || content.includes('import ');
  }

  async resolveModule(moduleName, fromPath) {
    // Simple module resolution - in production, use enhanced-resolve
    if (moduleName.startsWith('.')) {
      return path.resolve(path.dirname(fromPath), moduleName + '.js');
    }
    return null; // Skip node_modules for now
  }

  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  getUnusedExports(moduleInfo, usage) {
    if (!usage) return moduleInfo.exports.named;
    
    return moduleInfo.exports.named.filter(
      exportName => !usage.namedExports.has(exportName)
    );
  }

  generateTreeShakingRecommendations(report) {
    const recommendations = [];

    // High side effect modules
    const highSideEffectModules = report.sideEffectAnalysis.filter(m => m.score > 10);
    if (highSideEffectModules.length > 0) {
      recommendations.push({
        type: 'HIGH_SIDE_EFFECTS',
        message: `${highSideEffectModules.length} modules have high side effects`,
        priority: 'HIGH',
        modules: highSideEffectModules.map(m => m.module)
      });
    }

    // Modules with many unused exports
    const modulesWithUnusedExports = report.modules.filter(m => m.unusedExports.length > 5);
    if (modulesWithUnusedExports.length > 0) {
      recommendations.push({
        type: 'UNUSED_EXPORTS',
        message: `${modulesWithUnusedExports.length} modules have many unused exports`,
        priority: 'MEDIUM',
        suggestion: 'Consider removing unused exports or splitting modules'
      });
    }

    // Low tree shaking effectiveness
    if (report.summary.reductionPercentage < 20) {
      recommendations.push({
        type: 'LOW_EFFECTIVENESS',
        message: 'Tree shaking effectiveness is low',
        priority: 'HIGH',
        suggestion: 'Review module structure and reduce side effects'
      });
    }

    return recommendations;
  }

  async saveTreeShakingReport(report) {
    const reportsDir = 'reports/tree-shaking';
    await fs.mkdir(reportsDir, { recursive: true });
    
    const reportFile = path.join(reportsDir, `tree-shaking-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    logger.info(`Tree shaking report saved: ${reportFile}`);
  }
}

// Export singleton instance
export const treeShakingEngine = new TreeShakingEngine();
