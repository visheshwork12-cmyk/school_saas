#!/usr/bin/env node
// scripts/build/bundle.js - Bundle optimization for School ERP SaaS

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

class BundleManager {
  constructor(options = {}) {
    this.environment = options.environment || 'production';
    this.target = options.target || 'generic';
    this.analyze = options.analyze || false;
    this.minify = options.minify !== false;
    this.startTime = Date.now();
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

  async analyzeDependencies() {
    this.log('📊 Analyzing dependencies...');
    
    try {
      const packagePath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      
      const dependencies = Object.keys(packageJson.dependencies || {});
      const devDependencies = Object.keys(packageJson.devDependencies || {});
      
      this.log(`Found ${dependencies.length} production dependencies`);
      this.log(`Found ${devDependencies.length} development dependencies`);
      
      // Analyze bundle size impact
      const heavyDependencies = await this.findHeavyDependencies(dependencies);
      
      if (heavyDependencies.length > 0) {
        this.log('⚠️ Heavy dependencies detected:', 'warn');
        heavyDependencies.forEach(dep => {
          this.log(`  - ${dep.name}: ${dep.size}`, 'warn');
        });
      }
      
      return { dependencies, devDependencies, heavyDependencies };
    } catch (error) {
      this.log(`❌ Dependency analysis failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async findHeavyDependencies(dependencies) {
    const heavyDeps = [];
    
    try {
      for (const dep of dependencies) {
        const depPath = path.join(projectRoot, 'node_modules', dep);
        try {
          const stats = await fs.stat(depPath);
          if (stats.isDirectory()) {
            const size = await this.getDirSize(depPath);
            if (size > 1024 * 1024) { // > 1MB
              heavyDeps.push({
                name: dep,
                size: this.formatSize(size)
              });
            }
          }
        } catch {
          // Dependency not found, skip
        }
      }
    } catch (error) {
      this.log(`⚠️ Could not analyze dependency sizes: ${error.message}`, 'warn');
    }
    
    return heavyDeps.sort((a, b) => b.size.localeCompare(a.size));
  }

  async getDirSize(dirPath) {
    let size = 0;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          size += await this.getDirSize(entryPath);
        } else {
          const stats = await fs.stat(entryPath);
          size += stats.size;
        }
      }
    } catch {
      // Handle permission errors or missing files
    }
    
    return size;
  }

  formatSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  async optimizePackageJson() {
    this.log('📦 Optimizing package.json...');
    
    try {
      const packagePath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      
      // Create optimized version
      const optimizedPackage = {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        main: packageJson.main,
        type: packageJson.type,
        imports: packageJson.imports,
        scripts: this.getOptimizedScripts(packageJson.scripts),
        dependencies: packageJson.dependencies,
        engines: packageJson.engines,
        license: packageJson.license
      };
      
      // Remove dev dependencies for production
      if (this.environment === 'production') {
        delete optimizedPackage.devDependencies;
      }
      
      const outputPath = path.join(projectRoot, 'dist', 'package.json');
      await fs.writeFile(outputPath, JSON.stringify(optimizedPackage, null, 2));
      
      this.log('✅ Package.json optimized', 'success');
      return optimizedPackage;
    } catch (error) {
      this.log(`❌ Package.json optimization failed: ${error.message}`, 'error');
      throw error;
    }
  }

  getOptimizedScripts(scripts) {
    const productionScripts = {
      start: scripts.start || 'node src/server.js',
      'health:check': scripts['health:check'] || 'curl -f http://localhost:3000/health || exit 1'
    };
    
    // Add target-specific scripts
    switch (this.target) {
      case 'docker':
        productionScripts['docker:health'] = 'curl -f http://localhost:3000/health || exit 1';
        break;
      case 'k8s':
        productionScripts['k8s:health'] = 'curl -f http://localhost:3000/health || exit 1';
        break;
    }
    
    return productionScripts;
  }

  async createBundle() {
    this.log('📦 Creating application bundle...');
    
    try {
      const bundleDir = path.join(projectRoot, 'dist', 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      
      // Copy essential source files
      const srcDir = path.join(projectRoot, 'src');
      const bundleSrcDir = path.join(bundleDir, 'src');
      await this.copyDirectory(srcDir, bundleSrcDir);
      
      // Copy optimized package.json
      const packagePath = path.join(projectRoot, 'dist', 'package.json');
      await fs.copyFile(packagePath, path.join(bundleDir, 'package.json'));
      
      // Create bundle info
      const bundleInfo = {
        created: new Date().toISOString(),
        environment: this.environment,
        target: this.target,
        nodeVersion: process.version,
        bundleSize: await this.getDirSize(bundleDir)
      };
      
      await fs.writeFile(
        path.join(bundleDir, 'bundle-info.json'),
        JSON.stringify(bundleInfo, null, 2)
      );
      
      this.log(`✅ Bundle created: ${this.formatSize(bundleInfo.bundleSize)}`, 'success');
      return bundleInfo;
    } catch (error) {
      this.log(`❌ Bundle creation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      // Skip test files and other non-essential files
      if (this.shouldSkipFile(entry.name)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  shouldSkipFile(filename) {
    const skipPatterns = [
      /\.test\.js$/,
      /\.spec\.js$/,
      /\.md$/,
      /^\.git/,
      /^node_modules$/,
      /^coverage$/,
      /^logs$/,
      /\.log$/,
      /\.tmp$/
    ];
    
    return skipPatterns.some(pattern => pattern.test(filename));
  }

  async optimizeForProduction() {
    if (this.environment !== 'production') {
      return;
    }
    
    this.log('⚡ Applying production optimizations...');
    
    try {
      // Remove console.log statements (optional)
      if (this.minify) {
        await this.removeConsoleStatements();
      }
      
      // Optimize imports
      await this.optimizeImports();
      
      this.log('✅ Production optimizations applied', 'success');
    } catch (error) {
      this.log(`❌ Production optimization failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async removeConsoleStatements() {
    this.log('🔇 Removing console statements...');
    
    const bundleDir = path.join(projectRoot, 'dist', 'bundle', 'src');
    await this.processJSFiles(bundleDir, (content) => {
      // Remove console.log, console.debug, console.info
      return content
        .replace(/console\.(log|debug|info)\([^;]*\);?/g, '')
        .replace(/console\.(log|debug|info)\([^}]*\}[^;]*\);?/g, '');
    });
  }

  async optimizeImports() {
    this.log('📝 Optimizing imports...');
    
    const bundleDir = path.join(projectRoot, 'dist', 'bundle', 'src');
    await this.processJSFiles(bundleDir, (content) => {
      // Optimize lodash imports
      content = content.replace(
        /import\s+\*\s+as\s+_\s+from\s+['"]lodash['"];?/g,
        "// Lodash optimized imports"
      );
      
      return content;
    });
  }

  async processJSFiles(dir, processor) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await this.processJSFiles(entryPath, processor);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        const content = await fs.readFile(entryPath, 'utf8');
        const processed = processor(content);
        await fs.writeFile(entryPath, processed);
      }
    }
  }

  async generateBundleReport() {
    this.log('📊 Generating bundle report...');
    
    try {
      const bundleDir = path.join(projectRoot, 'dist', 'bundle');
      const bundleSize = await this.getDirSize(bundleDir);
      
      const report = {
        timestamp: new Date().toISOString(),
        environment: this.environment,
        target: this.target,
        bundleSize: {
          bytes: bundleSize,
          formatted: this.formatSize(bundleSize)
        },
        files: await this.getFileList(bundleDir),
        buildTime: Date.now() - this.startTime
      };
      
      const reportPath = path.join(projectRoot, 'dist', 'bundle-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      this.log(`✅ Bundle report generated: ${reportPath}`, 'success');
      
      // Display summary
      this.log('\n📊 Bundle Summary:', 'info');
      this.log(`  Size: ${report.bundleSize.formatted}`, 'info');
      this.log(`  Files: ${report.files.length}`, 'info');
      this.log(`  Build time: ${report.buildTime}ms`, 'info');
      
      return report;
    } catch (error) {
      this.log(`❌ Bundle report generation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async getFileList(dir, basePath = '') {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const relativePath = path.join(basePath, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await this.getFileList(entryPath, relativePath);
        files.push(...subFiles);
      } else {
        const stats = await fs.stat(entryPath);
        files.push({
          path: relativePath,
          size: stats.size,
          formatted: this.formatSize(stats.size)
        });
      }
    }
    
    return files;
  }

  async run() {
    try {
      this.log(`🚀 Starting bundle process for ${this.target} target...`);
      
      const analysis = await this.analyzeDependencies();
      await this.optimizePackageJson();
      const bundleInfo = await this.createBundle();
      await this.optimizeForProduction();
      const report = await this.generateBundleReport();
      
      const duration = Date.now() - this.startTime;
      this.log(`🎉 Bundle completed successfully in ${duration}ms`, 'success');
      
      return { analysis, bundleInfo, report };
    } catch (error) {
      this.log(`💥 Bundle failed: ${error.message}`, 'error');
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
  const bundler = new BundleManager(options);
  bundler.run();
}

export default BundleManager;
