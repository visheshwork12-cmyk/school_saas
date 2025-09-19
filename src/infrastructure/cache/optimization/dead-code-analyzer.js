// src/infrastructure/optimization/dead-code-analyzer.js
import fs from "fs/promises";
import path from "path";
import { logger } from "#utils/core/logger.js";
import { AST } from "abstract-syntax-tree";
import glob from "glob";

/**
 * Dead Code Analyzer
 * Identifies and eliminates unused code across the application
 */
export class DeadCodeAnalyzer {
  constructor() {
    this.sourceDirectories = [
      'src/domain',
      'src/shared',
      'src/infrastructure',
      'src/application'
    ];
    this.excludePatterns = [
      '**/node_modules/**',
      '**/test/**',
      '**/tests/**',
      '**/*.test.js',
      '**/*.spec.js'
    ];
    this.usageMap = new Map();
    this.exportMap = new Map();
    this.importMap = new Map();
    this.deadCodeResults = new Map();
  }

  /**
   * Analyze entire codebase for dead code
   */
  async analyzeDeadCode() {
    try {
      logger.info('Starting dead code analysis');

      // Get all JavaScript files
      const files = await this.getSourceFiles();
      
      // Build usage maps
      await this.buildUsageMaps(files);
      
      // Identify dead code
      const deadCode = await this.identifyDeadCode();
      
      // Generate report
      const report = await this.generateDeadCodeReport(deadCode);
      
      logger.info(`Dead code analysis completed. Found ${deadCode.size} unused items`);
      
      return report;

    } catch (error) {
      logger.error('Dead code analysis failed:', error);
      throw error;
    }
  }

  /**
   * Get all source files for analysis
   */
  async getSourceFiles() {
    const files = [];
    
    for (const directory of this.sourceDirectories) {
      const pattern = `${directory}/**/*.js`;
      const directoryFiles = glob.sync(pattern, {
        ignore: this.excludePatterns
      });
      files.push(...directoryFiles);
    }
    
    logger.debug(`Found ${files.length} source files for analysis`);
    return files;
  }

  /**
   * Build usage maps by analyzing AST
   */
  async buildUsageMaps(files) {
    for (const filePath of files) {
      try {
        await this.analyzeFile(filePath);
      } catch (error) {
        logger.warn(`Failed to analyze file ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Analyze individual file
   */
  async analyzeFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    
    try {
      const ast = AST.parse(content, { sourceType: 'module' });
      
      // Track exports
      this.trackExports(filePath, ast);
      
      // Track imports
      this.trackImports(filePath, ast);
      
      // Track function and variable usage
      this.trackUsage(filePath, ast);
      
    } catch (error) {
      logger.warn(`AST parsing failed for ${filePath}:`, error.message);
    }
  }

  /**
   * Track exported functions and variables
   */
  trackExports(filePath, ast) {
    AST.walk(ast, (node, parent) => {
      // Named exports
      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration) {
          this.addExport(filePath, this.getDeclarationNames(node.declaration));
        }
        if (node.specifiers) {
          node.specifiers.forEach(spec => {
            this.addExport(filePath, spec.exported.name);
          });
        }
      }
      
      // Default exports
      if (node.type === 'ExportDefaultDeclaration') {
        this.addExport(filePath, 'default');
      }
      
      // Export all
      if (node.type === 'ExportAllDeclaration') {
        this.addExport(filePath, '*');
      }
    });
  }

  /**
   * Track imported functions and variables
   */
  trackImports(filePath, ast) {
    AST.walk(ast, (node) => {
      if (node.type === 'ImportDeclaration') {
        const source = node.source.value;
        
        node.specifiers.forEach(spec => {
          let importedName;
          let localName;
          
          if (spec.type === 'ImportDefaultSpecifier') {
            importedName = 'default';
            localName = spec.local.name;
          } else if (spec.type === 'ImportSpecifier') {
            importedName = spec.imported.name;
            localName = spec.local.name;
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            importedName = '*';
            localName = spec.local.name;
          }
          
          this.addImport(filePath, source, importedName, localName);
        });
      }
    });
  }

  /**
   * Track function and variable usage
   */
  trackUsage(filePath, ast) {
    AST.walk(ast, (node) => {
      // Function calls
      if (node.type === 'CallExpression') {
        const functionName = this.getFunctionName(node.callee);
        if (functionName) {
          this.addUsage(filePath, functionName);
        }
      }
      
      // Identifier references
      if (node.type === 'Identifier') {
        this.addUsage(filePath, node.name);
      }
      
      // Member expressions
      if (node.type === 'MemberExpression') {
        const memberName = this.getMemberName(node);
        if (memberName) {
          this.addUsage(filePath, memberName);
        }
      }
    });
  }

  /**
   * Identify dead code by cross-referencing exports and usage
   */
  async identifyDeadCode() {
    const deadCode = new Map();
    
    // Check each export
    for (const [filePath, exports] of this.exportMap) {
      const unusedExports = [];
      
      for (const exportName of exports) {
        if (!this.isExportUsed(filePath, exportName)) {
          unusedExports.push(exportName);
        }
      }
      
      if (unusedExports.length > 0) {
        deadCode.set(filePath, {
          type: 'unused_exports',
          items: unusedExports,
          file: filePath
        });
      }
    }
    
    // Check for unused files
    const unusedFiles = await this.findUnusedFiles();
    unusedFiles.forEach(file => {
      deadCode.set(file, {
        type: 'unused_file',
        items: [path.basename(file)],
        file
      });
    });
    
    return deadCode;
  }

  /**
   * Check if export is used anywhere
   */
  isExportUsed(filePath, exportName) {
    // Check direct imports
    for (const [importFile, imports] of this.importMap) {
      if (importFile === filePath) continue;
      
      for (const imp of imports) {
        if (this.resolveImportPath(importFile, imp.source) === filePath) {
          if (imp.importedName === exportName || imp.importedName === '*') {
            return true;
          }
        }
      }
    }
    
    // Check usage within same file
    const fileUsage = this.usageMap.get(filePath) || [];
    return fileUsage.includes(exportName);
  }

  /**
   * Find completely unused files
   */
  async findUnusedFiles() {
    const unusedFiles = [];
    const allFiles = await this.getSourceFiles();
    
    for (const file of allFiles) {
      const isImported = this.isFileImported(file);
      const isEntryPoint = this.isEntryPoint(file);
      
      if (!isImported && !isEntryPoint) {
        unusedFiles.push(file);
      }
    }
    
    return unusedFiles;
  }

  /**
   * Generate comprehensive dead code report
   */
  async generateDeadCodeReport(deadCode) {
    const report = {
      generatedAt: new Date(),
      summary: {
        totalFiles: deadCode.size,
        unusedExports: 0,
        unusedFiles: 0,
        estimatedSavings: 0
      },
      findings: [],
      recommendations: []
    };

    for (const [filePath, finding] of deadCode) {
      const fileStats = await this.getFileStats(filePath);
      
      const reportItem = {
        file: filePath,
        type: finding.type,
        unusedItems: finding.items,
        lines: fileStats.lines,
        size: fileStats.size,
        lastModified: fileStats.lastModified
      };

      if (finding.type === 'unused_exports') {
        report.summary.unusedExports += finding.items.length;
        reportItem.estimatedSavings = this.estimateExportSavings(finding.items, fileStats);
      } else if (finding.type === 'unused_file') {
        report.summary.unusedFiles++;
        reportItem.estimatedSavings = fileStats.size;
      }

      report.summary.estimatedSavings += reportItem.estimatedSavings;
      report.findings.push(reportItem);
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report);

    // Save report
    await this.saveReport(report);

    return report;
  }

  /**
   * Remove dead code automatically
   */
  async removeDeadCode(deadCodeReport, options = {}) {
    const results = {
      filesModified: 0,
      filesDeleted: 0,
      linesRemoved: 0,
      bytesRemoved: 0,
      errors: []
    };

    try {
      for (const finding of deadCodeReport.findings) {
        if (finding.type === 'unused_file' && options.removeFiles) {
          await this.removeUnusedFile(finding.file);
          results.filesDeleted++;
          results.bytesRemoved += finding.size;
        } else if (finding.type === 'unused_exports' && options.removeExports) {
          const removed = await this.removeUnusedExports(finding.file, finding.unusedItems);
          results.filesModified++;
          results.linesRemoved += removed.lines;
          results.bytesRemoved += removed.bytes;
        }
      }
    } catch (error) {
      results.errors.push(error.message);
      logger.error('Dead code removal failed:', error);
    }

    return results;
  }

  // Helper methods
  addExport(filePath, exportName) {
    if (!this.exportMap.has(filePath)) {
      this.exportMap.set(filePath, new Set());
    }
    this.exportMap.get(filePath).add(exportName);
  }

  addImport(filePath, source, importedName, localName) {
    if (!this.importMap.has(filePath)) {
      this.importMap.set(filePath, []);
    }
    this.importMap.get(filePath).push({
      source,
      importedName,
      localName
    });
  }

  addUsage(filePath, name) {
    if (!this.usageMap.has(filePath)) {
      this.usageMap.set(filePath, new Set());
    }
    this.usageMap.get(filePath).add(name);
  }

  getDeclarationNames(declaration) {
    const names = [];
    
    if (declaration.type === 'FunctionDeclaration' && declaration.id) {
      names.push(declaration.id.name);
    } else if (declaration.type === 'VariableDeclaration') {
      declaration.declarations.forEach(decl => {
        if (decl.id && decl.id.type === 'Identifier') {
          names.push(decl.id.name);
        }
      });
    } else if (declaration.type === 'ClassDeclaration' && declaration.id) {
      names.push(declaration.id.name);
    }
    
    return names;
  }

  getFunctionName(callee) {
    if (callee.type === 'Identifier') {
      return callee.name;
    } else if (callee.type === 'MemberExpression') {
      return this.getMemberName(callee);
    }
    return null;
  }

  getMemberName(memberExpression) {
    if (memberExpression.object && memberExpression.property) {
      const objectName = memberExpression.object.name || 'unknown';
      const propertyName = memberExpression.property.name || 'unknown';
      return `${objectName}.${propertyName}`;
    }
    return null;
  }

  resolveImportPath(fromFile, importPath) {
    // Simple resolution - in production, use proper module resolution
    if (importPath.startsWith('.')) {
      return path.resolve(path.dirname(fromFile), importPath);
    }
    return importPath;
  }

  isFileImported(filePath) {
    for (const [, imports] of this.importMap) {
      for (const imp of imports) {
        if (imp.source.includes(path.basename(filePath, '.js'))) {
          return true;
        }
      }
    }
    return false;
  }

  isEntryPoint(filePath) {
    const entryPoints = ['server.js', 'index.js', 'app.js'];
    const fileName = path.basename(filePath);
    return entryPoints.includes(fileName);
  }

  async getFileStats(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      
      return {
        size: stats.size,
        lines: content.split('\n').length,
        lastModified: stats.mtime
      };
    } catch (error) {
      return { size: 0, lines: 0, lastModified: null };
    }
  }

  estimateExportSavings(unusedExports, fileStats) {
    // Rough estimate: each unused export saves ~2% of file size
    const savingsPerExport = fileStats.size * 0.02;
    return Math.round(unusedExports.length * savingsPerExport);
  }

  generateRecommendations(report) {
    const recommendations = [];
    
    if (report.summary.unusedFiles > 0) {
      recommendations.push({
        type: 'DELETE_UNUSED_FILES',
        message: `Consider deleting ${report.summary.unusedFiles} unused files`,
        priority: 'HIGH',
        estimatedSavings: report.findings
          .filter(f => f.type === 'unused_file')
          .reduce((sum, f) => sum + f.size, 0)
      });
    }
    
    if (report.summary.unusedExports > 10) {
      recommendations.push({
        type: 'REMOVE_UNUSED_EXPORTS',
        message: `Remove ${report.summary.unusedExports} unused exports`,
        priority: 'MEDIUM',
        estimatedSavings: report.findings
          .filter(f => f.type === 'unused_exports')
          .reduce((sum, f) => sum + f.estimatedSavings, 0)
      });
    }
    
    return recommendations;
  }

  async saveReport(report) {
    const reportsDir = 'reports/dead-code';
    await fs.mkdir(reportsDir, { recursive: true });
    
    const reportFile = path.join(reportsDir, `dead-code-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    logger.info(`Dead code report saved: ${reportFile}`);
  }
}

// Export singleton instance
export const deadCodeAnalyzer = new DeadCodeAnalyzer();
