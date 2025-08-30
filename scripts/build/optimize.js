#!/usr/bin/env node
// scripts/build/optimize.js - Advanced optimization for School ERP SaaS

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

class OptimizationManager {
  constructor(options = {}) {
    this.target = options.target || 'generic';
    this.level = options.level || 'standard'; // minimal, standard, aggressive
    this.profile = options.profile || false;
    this.startTime = Date.now();
    this.optimizations = [];
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: chalk.blue,
      success: chalk.green,
      warn: chalk.yellow,
      error: chalk.red
    };
    
    console.log(`${colors[level](`[${level.toUpperCase()}]`)} ${timestamp} - ${message}`);
  }

  async analyzeCodebase() {
    this.log('🔍 Analyzing codebase for optimization opportunities...');
    
    try {
      const analysis = {
        totalFiles: 0,
        totalSize: 0,
        fileTypes: {},
        largeFiles: [],
        duplicates: [],
        unusedFiles: []
      };
      
      const srcDir = path.join(projectRoot, 'src');
      await this.analyzeDirectory(srcDir, analysis);
      
      this.log(`📊 Analysis complete: ${analysis.totalFiles} files, ${this.formatSize(analysis.totalSize)}`);
      
      // Find optimization opportunities
      const opportunities = this.findOptimizationOpportunities(analysis);
      
      return { analysis, opportunities };
    } catch (error) {
      this.log(`❌ Codebase analysis failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async analyzeDirectory(dir, analysis, basePath = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const relativePath = path.join(basePath, entry.name);
      
      if (entry.isDirectory()) {
        await this.analyzeDirectory(entryPath, analysis, relativePath);
      } else {
        const stats = await fs.stat(entryPath);
        const ext = path.extname(entry.name);
        
        analysis.totalFiles++;
        analysis.totalSize += stats.size;
        analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;
        
        // Track large files (>100KB)
        if (stats.size > 100 * 1024) {
          analysis.largeFiles.push({
            path: relativePath,
            size: stats.size,
            formatted: this.formatSize(stats.size)
          });
        }
      }
    }
  }

  findOptimizationOpportunities(analysis) {
    const opportunities = [];
    
    // Large files
    if (analysis.largeFiles.length > 0) {
      opportunities.push({
        type: 'large-files',
        priority: 'medium',
        description: `${analysis.largeFiles.length} large files detected`,
        files: analysis.largeFiles
      });
    }
    
    // Too many small files (potential bundling opportunity)
    const smallFiles = Object.entries(analysis.fileTypes)
      .filter(([ext, count]) => ext === '.js' && count > 50);
    
    if (smallFiles.length > 0) {
      opportunities.push({
        type: 'fragmentation',
        priority: 'low',
        description: 'Many small JavaScript files could be bundled'
      });
    }
    
    return opportunities;
  }

  async optimizeCode() {
    this.log('⚡ Starting code optimization...');
    
    const optimizations = [];
    
    try {
      // Apply optimizations based on level
      switch (this.level) {
        case 'aggressive':
          optimizations.push(...await this.applyAggressiveOptimizations());
          // Fall through
        case 'standard':
          optimizations.push(...await this.applyStandardOptimizations());
          // Fall through
        case 'minimal':
          optimizations.push(...await this.applyMinimalOptimizations());
          break;
      }
      
      this.optimizations = optimizations;
      this.log(`✅ Applied ${optimizations.length} optimizations`, 'success');
      
      return optimizations;
    } catch (error) {
      this.log(`❌ Code optimization failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async applyMinimalOptimizations() {
    const optimizations = [];
    
    // Remove empty files
    const emptyFiles = await this.findEmptyFiles();
    if (emptyFiles.length > 0) {
      await this.removeEmptyFiles(emptyFiles);
      optimizations.push({
        type: 'remove-empty-files',
        count: emptyFiles.length,
        impact: 'minimal'
      });
    }
    
    // Trim whitespace
    await this.trimWhitespace();
    optimizations.push({
      type: 'trim-whitespace',
      impact: 'minimal'
    });
    
    return optimizations;
  }

  async applyStandardOptimizations() {
    const optimizations = [];
    
    // Remove unused imports
    const unusedImports = await this.removeUnusedImports();
    if (unusedImports > 0) {
      optimizations.push({
        type: 'remove-unused-imports',
        count: unusedImports,
        impact: 'medium'
      });
    }
    
    // Optimize requires/imports
    await this.optimizeImports();
    optimizations.push({
      type: 'optimize-imports',
      impact: 'medium'
    });
    
    // Remove debug code
    const debugLines = await this.removeDebugCode();
    if (debugLines > 0) {
      optimizations.push({
        type: 'remove-debug-code',
        count: debugLines,
        impact: 'medium'
      });
    }
    
    return optimizations;
  }

  async applyAggressiveOptimizations() {
    const optimizations = [];
    
    // Minify code (basic)
    await this.minifyCode();
    optimizations.push({
      type: 'minify-code',
      impact: 'high'
    });
    
    // Dead code elimination
    const deadCodeFiles = await this.eliminateDeadCode();
    if (deadCodeFiles > 0) {
      optimizations.push({
        type: 'dead-code-elimination',
        count: deadCodeFiles,
        impact: 'high'
      });
    }
    
    return optimizations;
  }

  async findEmptyFiles() {
    const emptyFiles = [];
    const srcDir = path.join(projectRoot, 'dist', 'src');
    
    await this.findEmptyFilesInDir(srcDir, emptyFiles);
    return emptyFiles;
  }

  async findEmptyFilesInDir(dir, emptyFiles, basePath = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);
        
        if (entry.isDirectory()) {
          await this.findEmptyFilesInDir(entryPath, emptyFiles, relativePath);
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
          const content = await fs.readFile(entryPath, 'utf8');
          if (content.trim().length === 0) {
            emptyFiles.push(entryPath);
          }
        }
      }
    } catch {
      // Directory doesn't exist or no permission
    }
  }

  async removeEmptyFiles(emptyFiles) {
    for (const file of emptyFiles) {
      try {
        await fs.unlink(file);
        this.log(`Removed empty file: ${path.relative(projectRoot, file)}`);
      } catch {
        // File might already be removed
      }
    }
  }

  async trimWhitespace() {
    const srcDir = path.join(projectRoot, 'dist', 'src');
    await this.processFiles(srcDir, async (filePath, content) => {
      // Trim trailing whitespace and normalize line endings
      const trimmed = content
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .trim() + '\n';
      
      if (trimmed !== content) {
        await fs.writeFile(filePath, trimmed);
        return true;
      }
      return false;
    });
  }

  async removeUnusedImports() {
    let removedCount = 0;
    const srcDir = path.join(projectRoot, 'dist', 'src');
    
    await this.processFiles(srcDir, async (filePath, content) => {
      const originalContent = content;
      
      // Simple unused import detection (basic implementation)
      const lines = content.split('\n');
      const newLines = [];
      
      for (const line of lines) {
        const importMatch = line.match(/^import\s+.*?from\s+['"](.+?)['"];?$/);
        if (importMatch) {
          const importName = this.extractImportName(line);
          if (importName && !this.isUsedInCode(importName, content)) {
            removedCount++;
            continue; // Skip unused import
          }
        }
        newLines.push(line);
      }
      
      const newContent = newLines.join('\n');
      if (newContent !== originalContent) {
        await fs.writeFile(filePath, newContent);
        return true;
      }
      return false;
    });
    
    return removedCount;
  }

  extractImportName(importLine) {
    // Extract variable name from import statement
    const match = importLine.match(/import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))/);
    if (match) {
      return match[1] || match[2] || match[3];
    }
    return null;
  }

  isUsedInCode(importName, content) {
    // Simple usage detection (could be improved)
    const usageRegex = new RegExp(`\\b${importName}\\b`, 'g');
    const matches = content.match(usageRegex);
    return matches && matches.length > 1; // More than just the import line
  }

  async optimizeImports() {
    const srcDir = path.join(projectRoot, 'dist', 'src');
    
    await this.processFiles(srcDir, async (filePath, content) => {
      let optimized = content;
      
      // Sort imports
      const lines = content.split('\n');
      const importLines = [];
      const otherLines = [];
      
      for (const line of lines) {
        if (line.match(/^import\s+/)) {
          importLines.push(line);
        } else {
          otherLines.push(line);
        }
      }
      
      // Sort import lines
      importLines.sort();
      
      optimized = [...importLines, '', ...otherLines].join('\n');
      
      if (optimized !== content) {
        await fs.writeFile(filePath, optimized);
        return true;
      }
      return false;
    });
  }

  async removeDebugCode() {
    let removedLines = 0;
    const srcDir = path.join(projectRoot, 'dist', 'src');
    
    await this.processFiles(srcDir, async (filePath, content) => {
      const lines = content.split('\n');
      const newLines = [];
      
      for (const line of lines) {
        // Remove console.debug, console.log in production
        if (line.match(/console\.(debug|log|info)\s*\(/)) {
          removedLines++;
          continue;
        }
        
        // Remove TODO comments
        if (line.match(/\/\/\s*TODO:/i)) {
          removedLines++;
          continue;
        }
        
        newLines.push(line);
      }
      
      const newContent = newLines.join('\n');
      if (newContent !== content) {
        await fs.writeFile(filePath, newContent);
        return true;
      }
      return false;
    });
    
    return removedLines;
  }

  async minifyCode() {
    const srcDir = path.join(projectRoot, 'dist', 'src');
    
    await this.processFiles(srcDir, async (filePath, content) => {
      // Basic minification: remove extra whitespace and comments
      let minified = content
        // Remove single-line comments
        .replace(/\/\/.*$/gm, '')
        // Remove multi-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        // Remove whitespace around operators
        .replace(/\s*([{}();,])\s*/g, '$1');
      
      if (minified !== content) {
        await fs.writeFile(filePath, minified);
        return true;
      }
      return false;
    });
  }

  async eliminateDeadCode() {
    // This is a simplified implementation
    // In production, you might want to use a proper dead code elimination tool
    let eliminatedFiles = 0;
    
    // For now, just remove files that are never imported
    const srcDir = path.join(projectRoot, 'dist', 'src');
    const allFiles = await this.getAllJSFiles(srcDir);
    const importedFiles = new Set();
    
    // Find all imported files
    for (const file of allFiles) {
      const content = await fs.readFile(file, 'utf8');
      const imports = content.match(/from\s+['"]([^'"]+)['"]/g);
      
      if (imports) {
        for (const imp of imports) {
          const match = imp.match(/from\s+['"]([^'"]+)['"]/);
          if (match) {
            importedFiles.add(match[1]);
          }
        }
      }
    }
    
    // This is a very basic implementation
    // Real dead code elimination would require more sophisticated analysis
    
    return eliminatedFiles;
  }

  async getAllJSFiles(dir) {
    const files = [];
    
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await this.getAllJSFiles(entryPath);
        files.push(...subFiles);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        files.push(entryPath);
      }
    }
    
    return files;
  }

  async processFiles(dir, processor) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await this.processFiles(entryPath, processor);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        try {
          const content = await fs.readFile(entryPath, 'utf8');
          await processor(entryPath, content);
        } catch (error) {
          this.log(`⚠️ Could not process ${entryPath}: ${error.message}`, 'warn');
        }
      }
    }
  }

  formatSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  async generateOptimizationReport() {
    this.log('📊 Generating optimization report...');
    
    try {
      const report = {
        timestamp: new Date().toISOString(),
        level: this.level,
        target: this.target,
        duration: Date.now() - this.startTime,
        optimizations: this.optimizations,
        summary: {
          totalOptimizations: this.optimizations.length,
          impactLevels: this.optimizations.reduce((acc, opt) => {
            acc[opt.impact] = (acc[opt.impact] || 0) + 1;
            return acc;
          }, {})
        }
      };
      
      const reportPath = path.join(projectRoot, 'dist', 'optimization-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      this.log(`✅ Optimization report generated: ${reportPath}`, 'success');
      
      // Display summary
      this.log('\n⚡ Optimization Summary:', 'info');
      this.log(`  Level: ${this.level}`, 'info');
      this.log(`  Optimizations: ${report.summary.totalOptimizations}`, 'info');
      this.log(`  Duration: ${report.duration}ms`, 'info');
      
      Object.entries(report.summary.impactLevels).forEach(([impact, count]) => {
        this.log(`  ${impact} impact: ${count}`, 'info');
      });
      
      return report;
    } catch (error) {
      this.log(`❌ Report generation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async run() {
    try {
      this.log(`🚀 Starting optimization process (${this.level} level)...`);
      
      const { analysis, opportunities } = await this.analyzeCodebase();
      const optimizations = await this.optimizeCode();
      const report = await this.generateOptimizationReport();
      
      const duration = Date.now() - this.startTime;
      this.log(`🎉 Optimization completed successfully in ${duration}ms`, 'success');
      
      return { analysis, opportunities, optimizations, report };
    } catch (error) {
      this.log(`💥 Optimization failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// CLI handling
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      options[key] = value;
    }
  }
  
  return options;
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  const optimizer = new OptimizationManager(options);
  optimizer.run();
}

export default OptimizationManager;
