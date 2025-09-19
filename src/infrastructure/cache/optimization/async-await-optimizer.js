// src/infrastructure/optimization/async-await-optimizer.js
import { logger } from "#utils/core/logger.js";
import fs from "fs/promises";
import path from "path";
import { performance } from "perf_hooks";

/**
 * Async/Await Performance Optimizer
 * Optimizes asynchronous code patterns for better performance
 */
export class AsyncAwaitOptimizer {
  constructor() {
    this.optimizationPatterns = new Map();
    this.performanceMetrics = new Map();
    this.optimizationRules = new Map();
    this.initializeOptimizationPatterns();
  }

  /**
   * Initialize optimization patterns
   */
  initializeOptimizationPatterns() {
    // Sequential to parallel conversion
    this.addOptimizationPattern('SEQUENTIAL_TO_PARALLEL', {
      name: 'Convert Sequential to Parallel Execution',
      detect: this.detectSequentialPattern.bind(this),
      optimize: this.optimizeSequentialToParallel.bind(this),
      estimatedGain: 'HIGH'
    });

    // Early scheduling pattern
    this.addOptimizationPattern('EARLY_SCHEDULING', {
      name: 'Schedule Early, Await Late',
      detect: this.detectEarlySchedulingOpportunity.bind(this),
      optimize: this.optimizeEarlyScheduling.bind(this),
      estimatedGain: 'MEDIUM'
    });

    // Promise.all optimization
    this.addOptimizationPattern('PROMISE_ALL_OPTIMIZATION', {
      name: 'Optimize Promise.all Usage',
      detect: this.detectPromiseAllOpportunity.bind(this),
      optimize: this.optimizePromiseAll.bind(this),
      estimatedGain: 'HIGH'
    });

    // Error handling optimization
    this.addOptimizationPattern('ERROR_HANDLING', {
      name: 'Optimize Error Handling',
      detect: this.detectSuboptimalErrorHandling.bind(this),
      optimize: this.optimizeErrorHandling.bind(this),
      estimatedGain: 'MEDIUM'
    });

    // Memory-efficient async patterns
    this.addOptimizationPattern('MEMORY_EFFICIENT', {
      name: 'Memory-Efficient Async Patterns',
      detect: this.detectMemoryInefficiency.bind(this),
      optimize: this.optimizeMemoryUsage.bind(this),
      estimatedGain: 'MEDIUM'
    });
  }

  /**
   * Analyze and optimize async/await patterns
   */
  async optimizeAsyncPatterns(sourceFiles) {
    try {
      logger.info('Starting async/await optimization analysis');

      const results = {
        filesAnalyzed: 0,
        optimizationsFound: 0,
        performanceGains: {},
        recommendations: []
      };

      for (const filePath of sourceFiles) {
        try {
          const fileResults = await this.analyzeFile(filePath);
          results.filesAnalyzed++;
          results.optimizationsFound += fileResults.optimizations.length;
          
          // Merge performance gains
          for (const [pattern, gain] of Object.entries(fileResults.performanceGains)) {
            results.performanceGains[pattern] = (results.performanceGains[pattern] || 0) + gain;
          }
          
          results.recommendations.push(...fileResults.recommendations);

        } catch (error) {
          logger.warn(`Failed to analyze file ${filePath}:`, error.message);
        }
      }

      // Generate optimization report
      const report = await this.generateOptimizationReport(results);
      
      logger.info(`Async/await optimization completed. Found ${results.optimizationsFound} optimizations`);
      
      return report;

    } catch (error) {
      logger.error('Async/await optimization failed:', error);
      throw error;
    }
  }

  /**
   * Analyze individual file for async/await patterns
   */
  async analyzeFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const analysis = {
      filePath,
      optimizations: [],
      performanceGains: {},
      recommendations: []
    };

    // Apply each optimization pattern
    for (const [patternId, pattern] of this.optimizationPatterns) {
      const detectedIssues = pattern.detect(content, filePath);
      
      if (detectedIssues.length > 0) {
        const optimization = {
          pattern: patternId,
          name: pattern.name,
          issues: detectedIssues,
          estimatedGain: pattern.estimatedGain
        };

        analysis.optimizations.push(optimization);
        
        // Calculate performance gains
        const performanceGain = await this.measurePerformanceGain(pattern, detectedIssues);
        analysis.performanceGains[patternId] = performanceGain;

        // Generate recommendations
        const recommendations = this.generatePatternRecommendations(pattern, detectedIssues);
        analysis.recommendations.push(...recommendations);
      }
    }

    return analysis;
  }

  /**
   * Detect sequential async pattern that could be parallel
   */
  detectSequentialPattern(content, filePath) {
    const issues = [];
    
    // Look for sequential await calls that could be parallel
    const sequentialAwaitRegex = /await\s+\w+\([^)]*\);\s*\n\s*await\s+\w+\([^)]*\);/g;
    let match;
    
    while ((match = sequentialAwaitRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      issues.push({
        type: 'sequential_awaits',
        line: lineNumber,
        code: match[0],
        suggestion: 'Consider using Promise.all() for independent async operations'
      });
    }

    // Look for multiple database queries that could be batched
    const dbQueryPattern = /await\s+(?:db\.|database\.|query\.|find\.|update\.|delete\.)/g;
    const dbQueries = [];
    
    while ((match = dbQueryPattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      dbQueries.push({ line: lineNumber, match: match[0] });
    }

    // If multiple DB queries within small code block, suggest batching
    if (dbQueries.length >= 2) {
      for (let i = 0; i < dbQueries.length - 1; i++) {
        if (dbQueries[i + 1].line - dbQueries[i].line < 10) {
          issues.push({
            type: 'sequential_db_queries',
            line: dbQueries[i].line,
            suggestion: 'Consider batching database queries or using Promise.all()'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect early scheduling opportunities
   */
  detectEarlySchedulingOpportunity(content, filePath) {
    const issues = [];
    
    // Look for pattern where async operation is awaited immediately but result used later
    const immediateAwaitPattern = /const\s+(\w+)\s+=\s+await\s+([^;]+);[\s\S]*?(\1)/g;
    let match;
    
    while ((match = immediateAwaitPattern.exec(content)) !== null) {
      const varName = match[1];
      const asyncCall = match[2];
      const usage = match[3];
      
      // Check if there's significant code between await and usage
      const betweenCode = content.substring(match.index + match[0].indexOf(';'), match.index + match[0].lastIndexOf(varName));
      const linesBetween = betweenCode.split('\n').length;
      
      if (linesBetween > 5) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        issues.push({
          type: 'early_scheduling_opportunity',
          line: lineNumber,
          variable: varName,
          asyncCall,
          suggestion: 'Schedule async operation early, await when needed'
        });
      }
    }

    return issues;
  }

  /**
   * Detect Promise.all optimization opportunities
   */
  detectPromiseAllOpportunity(content, filePath) {
    const issues = [];
    
    // Look for multiple independent async operations
    const functionBlocks = this.extractFunctionBlocks(content);
    
    for (const block of functionBlocks) {
      const awaitStatements = this.extractAwaitStatements(block.content);
      
      if (awaitStatements.length >= 2) {
        const independentOperations = this.analyzeOperationDependencies(awaitStatements);
        
        if (independentOperations.length >= 2) {
          issues.push({
            type: 'promise_all_opportunity',
            line: block.startLine,
            function: block.name,
            operations: independentOperations,
            suggestion: 'Use Promise.all() for independent async operations'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect suboptimal error handling
   */
  detectSuboptimalErrorHandling(content, filePath) {
    const issues = [];
    
    // Look for try-catch blocks with multiple awaits
    const tryCatchBlocks = this.extractTryCatchBlocks(content);
    
    for (const block of tryCatchBlocks) {
      const awaitCount = (block.tryContent.match(/await/g) || []).length;
      
      if (awaitCount > 3) {
        issues.push({
          type: 'heavy_try_catch',
          line: block.startLine,
          awaitCount,
          suggestion: 'Consider splitting into smaller try-catch blocks or using Promise.allSettled()'
        });
      }

      // Check for generic error handling
      if (block.catchContent && !block.catchContent.includes('instanceof') && 
          !block.catchContent.includes('error.code') && !block.catchContent.includes('error.type')) {
        issues.push({
          type: 'generic_error_handling',
          line: block.catchLine,
          suggestion: 'Implement specific error handling for different error types'
        });
      }
    }

    return issues;
  }

  /**
   * Detect memory inefficiency in async patterns
   */
  detectMemoryInefficiency(content, filePath) {
    const issues = [];
    
    // Look for large data processing without streaming
    const largeDataPatterns = [
      /await\s+\w+\.findAll\(\)/g,
      /await\s+\w+\.select\(\'\*\'\)/g,
      /await\s+fetch\([^)]+\)\.then\(\w+\s*=>\s*\w+\.json\(\)\)/g
    ];

    for (const pattern of largeDataPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        issues.push({
          type: 'large_data_loading',
          line: lineNumber,
          code: match[0],
          suggestion: 'Consider using pagination, streaming, or chunked processing'
        });
      }
    }

    // Look for potential memory leaks in async operations
    const closurePatterns = /setTimeout\s*\(\s*async\s*\(/g;
    let match;
    
    while ((match = closurePatterns.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      issues.push({
        type: 'async_closure_leak',
        line: lineNumber,
        suggestion: 'Ensure proper cleanup of async operations in closures'
      });
    }

    return issues;
  }

  /**
   * Optimize sequential to parallel execution
   */
  optimizeSequentialToParallel(issues) {
    const optimizations = [];
    
    for (const issue of issues) {
      if (issue.type === 'sequential_awaits') {
        const optimizedCode = this.generateParallelCode(issue.code);
        optimizations.push({
          type: 'parallel_execution',
          original: issue.code,
          optimized: optimizedCode,
          line: issue.line,
          estimatedSpeedup: '2-3x'
        });
      }
    }
    
    return optimizations;
  }

  /**
   * Generate parallel execution code
   */
  generateParallelCode(originalCode) {
    // Simple transformation for demonstration
    // In production, this would use AST manipulation
    const awaitCalls = originalCode.match(/await\s+[^;]+/g) || [];
    
    if (awaitCalls.length >= 2) {
      const promises = awaitCalls.map((call, index) => 
        `const promise${index + 1} = ${call.replace('await ', '')}`
      ).join(';\n');
      
      const results = awaitCalls.map((_, index) => `promise${index + 1}`).join(', ');
      
      return `${promises};\nconst [${results.replace(/promise/g, 'result')}] = await Promise.all([${results}]);`;
    }
    
    return originalCode;
  }

  /**
   * Measure performance gain for optimization
   */
  async measurePerformanceGain(pattern, issues) {
    // Simulate performance measurement
    // In production, this would run actual benchmarks
    const gainMap = {
      'SEQUENTIAL_TO_PARALLEL': issues.length * 150, // 150ms average gain per optimization
      'EARLY_SCHEDULING': issues.length * 50,
      'PROMISE_ALL_OPTIMIZATION': issues.length * 200,
      'ERROR_HANDLING': issues.length * 20,
      'MEMORY_EFFICIENT': issues.length * 30
    };
    
    return gainMap[pattern.name] || 0;
  }

  /**
   * Create optimized async utilities
   */
  createOptimizedAsyncUtils() {
    return {
      // Batch async operations with concurrency control
      async batchAsync(items, asyncFn, concurrency = 10) {
        const results = [];
        const executing = [];
        
        for (const item of items) {
          const promise = asyncFn(item).then(result => {
            executing.splice(executing.indexOf(promise), 1);
            return result;
          });
          
          results.push(promise);
          executing.push(promise);
          
          if (executing.length >= concurrency) {
            await Promise.race(executing);
          }
        }
        
        return Promise.all(results);
      },

      // Retry with exponential backoff
      async retryWithBackoff(asyncFn, maxRetries = 3, baseDelay = 1000) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            return await asyncFn();
          } catch (error) {
            if (attempt === maxRetries) throw error;
            
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      },

      // Timeout wrapper
      async withTimeout(asyncFn, timeoutMs = 5000) {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
        });
        
        return Promise.race([asyncFn(), timeoutPromise]);
      },

      // Cache async results
      createAsyncCache(ttlMs = 300000) {
        const cache = new Map();
        
        return async function cachedAsyncFn(key, asyncFn) {
          const now = Date.now();
          const cached = cache.get(key);
          
          if (cached && now - cached.timestamp < ttlMs) {
            return cached.value;
          }
          
          const value = await asyncFn();
          cache.set(key, { value, timestamp: now });
          
          return value;
        };
      },

      // Debounce async operations
      debounceAsync(asyncFn, delay = 300) {
        let timeoutId;
        let lastPromise;
        
        return function debouncedAsyncFn(...args) {
          clearTimeout(timeoutId);
          
          return new Promise((resolve, reject) => {
            timeoutId = setTimeout(async () => {
              try {
                const result = await asyncFn.apply(this, args);
                resolve(result);
              } catch (error) {
                reject(error);
              }
            }, delay);
          });
        };
      }
    };
  }

  // Helper methods
  addOptimizationPattern(patternId, pattern) {
    this.optimizationPatterns.set(patternId, pattern);
  }

  extractFunctionBlocks(content) {
    // Simple function extraction - in production, use AST
    const functionRegex = /(async\s+)?function\s+(\w+)[^{]*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    const blocks = [];
    let match;
    
    while ((match = functionRegex.exec(content)) !== null) {
      const startLine = content.substring(0, match.index).split('\n').length;
      blocks.push({
        name: match[2],
        content: match[3],
        startLine,
        isAsync: !!match[1]
      });
    }
    
    return blocks;
  }

  extractAwaitStatements(content) {
    const awaitRegex = /await\s+([^;]+)/g;
    const statements = [];
    let match;
    
    while ((match = awaitRegex.exec(content)) !== null) {
      statements.push({
        expression: match[1],
        fullMatch: match[0]
      });
    }
    
    return statements;
  }

  analyzeOperationDependencies(awaitStatements) {
    // Simple independence check - in production, use data flow analysis
    const independent = [];
    
    for (let i = 0; i < awaitStatements.length; i++) {
      const current = awaitStatements[i];
      let isIndependent = true;
      
      for (let j = 0; j < i; j++) {
        const previous = awaitStatements[j];
        if (current.expression.includes(this.extractVariableName(previous.expression))) {
          isIndependent = false;
          break;
        }
      }
      
      if (isIndependent) {
        independent.push(current);
      }
    }
    
    return independent;
  }

  extractVariableName(expression) {
    const match = expression.match(/(\w+)\s*\(/);
    return match ? match[1] : '';
  }

  extractTryCatchBlocks(content) {
    const tryRegex = /try\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*catch\s*\([^)]*\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    const blocks = [];
    let match;
    
    while ((match = tryRegex.exec(content)) !== null) {
      const startLine = content.substring(0, match.index).split('\n').length;
      const catchLine = startLine + match[1].split('\n').length + 1;
      
      blocks.push({
        tryContent: match[1],
        catchContent: match[2],
        startLine,
        catchLine
      });
    }
    
    return blocks;
  }

  generatePatternRecommendations(pattern, issues) {
    return issues.map(issue => ({
      type: pattern.name,
      line: issue.line,
      suggestion: issue.suggestion,
      priority: this.calculatePriority(pattern.estimatedGain, issue.type)
    }));
  }

  calculatePriority(estimatedGain, issueType) {
    if (estimatedGain === 'HIGH') return 'HIGH';
    if (estimatedGain === 'MEDIUM' && issueType.includes('memory')) return 'HIGH';
    if (estimatedGain === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }

  async generateOptimizationReport(results) {
    const report = {
      generatedAt: new Date(),
      summary: {
        filesAnalyzed: results.filesAnalyzed,
        optimizationsFound: results.optimizationsFound,
        estimatedPerformanceGain: Object.values(results.performanceGains).reduce((sum, gain) => sum + gain, 0),
        topOptimizations: this.getTopOptimizations(results.performanceGains)
      },
      recommendations: results.recommendations.sort((a, b) => {
        const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }),
      performanceGains: results.performanceGains,
      optimizedUtils: this.createOptimizedAsyncUtils()
    };

    // Save report
    await this.saveOptimizationReport(report);

    return report;
  }

  getTopOptimizations(performanceGains) {
    return Object.entries(performanceGains)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern, gain]) => ({ pattern, gain }));
  }

  async saveOptimizationReport(report) {
    const reportsDir = 'reports/async-optimization';
    await fs.mkdir(reportsDir, { recursive: true });
    
    const reportFile = path.join(reportsDir, `async-optimization-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    logger.info(`Async optimization report saved: ${reportFile}`);
  }
}

// Export singleton instance
export const asyncAwaitOptimizer = new AsyncAwaitOptimizer();
