// scripts/build/build.js - Main build script for School ERP SaaS

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// Configuration
const BUILD_CONFIG = {
  outputDir: path.join(projectRoot, 'dist'),
  sourceDir: path.join(projectRoot, 'src'),
  environments: ['development', 'staging', 'production'],
  targets: ['docker', 'aws', 'vercel', 'k8s'],
  assets: ['public', 'templates', 'locales'],
  excludePatterns: [
    '**/*.test.js',
    '**/*.spec.js',
    '**/*.md',
    '**/node_modules/**',
    '**/coverage/**',
    '**/logs/**'
  ]
};

class BuildManager {
  constructor(options = {}) {
    this.target = options.target || 'generic';
    this.environment = options.environment || 'production';
    this.verbose = options.verbose || false;
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

  async checkPrerequisites() {
    this.log('🔍 Checking build prerequisites...');
    
    try {
      // Check Node.js version
      const nodeVersion = process.version;
      const requiredVersion = '18.0.0';
      
      if (this.compareVersions(nodeVersion.slice(1), requiredVersion) < 0) {
        throw new Error(`Node.js version ${requiredVersion} or higher required, found ${nodeVersion}`);
      }
      
      // Check if source directory exists
      await fs.access(BUILD_CONFIG.sourceDir);
      
      // Check package.json
      const packagePath = path.join(projectRoot, 'package.json');
      await fs.access(packagePath);
      
      this.log('✅ Prerequisites check passed', 'success');
    } catch (error) {
      this.log(`❌ Prerequisites check failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }

  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part < v2part) return -1;
      if (v1part > v2part) return 1;
    }
    return 0;
  }

  async cleanBuildDirectory() {
    this.log('🧹 Cleaning build directory...');
    
    try {
      await fs.rm(BUILD_CONFIG.outputDir, { recursive: true, force: true });
      await fs.mkdir(BUILD_CONFIG.outputDir, { recursive: true });
      this.log('✅ Build directory cleaned', 'success');
    } catch (error) {
      this.log(`❌ Failed to clean build directory: ${error.message}`, 'error');
      throw error;
    }
  }

  async copySourceFiles() {
    this.log('📂 Copying source files...');
    
    try {
      await this.copyDirectory(BUILD_CONFIG.sourceDir, path.join(BUILD_CONFIG.outputDir, 'src'));
      
      // Copy essential files
      const essentialFiles = [
        'package.json',
        'package-lock.json',
        '.env.example',
        'README.md'
      ];
      
      for (const file of essentialFiles) {
        const srcPath = path.join(projectRoot, file);
        const destPath = path.join(BUILD_CONFIG.outputDir, file);
        
        try {
          await fs.copyFile(srcPath, destPath);
          this.log(`✅ Copied ${file}`, 'success');
        } catch (error) {
          if (file !== '.env.example') {
            this.log(`⚠️ Warning: Could not copy ${file}`, 'warn');
          }
        }
      }
      
      this.log('✅ Source files copied', 'success');
    } catch (error) {
      this.log(`❌ Failed to copy source files: ${error.message}`, 'error');
      throw error;
    }
  }

  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      // Skip excluded patterns
      if (this.shouldExclude(srcPath)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  shouldExclude(filePath) {
    return BUILD_CONFIG.excludePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(filePath);
    });
  }

  async processAssets() {
    this.log('🎨 Processing assets...');
    
    try {
      // Copy static assets
      for (const asset of BUILD_CONFIG.assets) {
        const assetPath = path.join(projectRoot, asset);
        const destPath = path.join(BUILD_CONFIG.outputDir, asset);
        
        try {
          await fs.access(assetPath);
          await this.copyDirectory(assetPath, destPath);
          this.log(`✅ Processed asset: ${asset}`, 'success');
        } catch (error) {
          this.log(`⚠️ Asset not found: ${asset}`, 'warn');
        }
      }
      
      this.log('✅ Assets processed', 'success');
    } catch (error) {
      this.log(`❌ Failed to process assets: ${error.message}`, 'error');
      throw error;
    }
  }

  async optimizeForTarget() {
    this.log(`🎯 Optimizing for target: ${this.target}`);
    
    try {
      switch (this.target) {
        case 'docker':
          await this.optimizeForDocker();
          break;
        case 'aws':
          await this.optimizeForAWS();
          break;
        case 'vercel':
          await this.optimizeForVercel();
          break;
        case 'k8s':
          await this.optimizeForKubernetes();
          break;
        default:
          this.log('Using generic optimization', 'info');
      }
      
      this.log('✅ Target optimization completed', 'success');
    } catch (error) {
      this.log(`❌ Target optimization failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async optimizeForDocker() {
    this.log('🐳 Applying Docker optimizations...');
    
    // Create optimized package.json for Docker
    const packagePath = path.join(BUILD_CONFIG.outputDir, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    
    // Remove dev dependencies for production Docker image
    delete packageJson.devDependencies;
    
    // Add Docker-specific scripts
    packageJson.scripts = {
      start: 'node src/server.js',
      'health-check': 'curl -f http://localhost:3000/health || exit 1'
    };
    
    await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
    
    // Create .dockerignore
    const dockerignore = `
node_modules
npm-debug.log
coverage
.nyc_output
logs
*.log
.git
.gitignore
README.md
.env
.env.local
Dockerfile
docker-compose*.yml
`;
    
    await fs.writeFile(path.join(BUILD_CONFIG.outputDir, '.dockerignore'), dockerignore.trim());
  }

  async optimizeForAWS() {
    this.log('☁️ Applying AWS optimizations...');
    
    // Create AWS-specific configuration
    const awsConfig = {
      runtime: 'nodejs18.x',
      memorySize: 1024,
      timeout: 30,
      environment: {
        NODE_ENV: this.environment,
        DEPLOYMENT_TYPE: 'aws'
      }
    };
    
    await fs.writeFile(
      path.join(BUILD_CONFIG.outputDir, 'aws-config.json'),
      JSON.stringify(awsConfig, null, 2)
    );
  }

  async optimizeForVercel() {
    this.log('▲ Applying Vercel optimizations...');
    
    // Create vercel.json configuration
    const vercelConfig = {
      version: 2,
      builds: [
        {
          src: 'src/server.js',
          use: '@vercel/node'
        }
      ],
      routes: [
        {
          src: '/(.*)',
          dest: '/src/server.js'
        }
      ]
    };
    
    await fs.writeFile(
      path.join(BUILD_CONFIG.outputDir, 'vercel.json'),
      JSON.stringify(vercelConfig, null, 2)
    );
  }

  async optimizeForKubernetes() {
    this.log('☸️ Applying Kubernetes optimizations...');
    
    // Create health check endpoints configuration
    const k8sConfig = {
      healthCheck: {
        path: '/health',
        port: 3000,
        initialDelaySeconds: 30,
        periodSeconds: 10
      },
      resources: {
        requests: {
          memory: '512Mi',
          cpu: '250m'
        },
        limits: {
          memory: '1Gi',
          cpu: '500m'
        }
      }
    };
    
    await fs.writeFile(
      path.join(BUILD_CONFIG.outputDir, 'k8s-config.json'),
      JSON.stringify(k8sConfig, null, 2)
    );
  }

  async generateBuildInfo() {
    this.log('📋 Generating build information...');
    
    try {
      const buildInfo = {
        version: process.env.npm_package_version || '1.0.0',
        buildTime: new Date().toISOString(),
        target: this.target,
        environment: this.environment,
        nodeVersion: process.version,
        gitCommit: this.getGitCommit(),
        gitBranch: this.getGitBranch(),
        buildDuration: Date.now() - this.startTime
      };
      
      await fs.writeFile(
        path.join(BUILD_CONFIG.outputDir, 'build-info.json'),
        JSON.stringify(buildInfo, null, 2)
      );
      
      this.log('✅ Build information generated', 'success');
    } catch (error) {
      this.log(`❌ Failed to generate build info: ${error.message}`, 'error');
      throw error;
    }
  }

  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  getGitBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  async validateBuild() {
    this.log('🔍 Validating build...');
    
    try {
      // Check if main entry point exists
      const mainEntry = path.join(BUILD_CONFIG.outputDir, 'src/server.js');
      await fs.access(mainEntry);
      
      // Check if package.json exists
      const packagePath = path.join(BUILD_CONFIG.outputDir, 'package.json');
      await fs.access(packagePath);
      
      // Validate package.json structure
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      if (!packageJson.main && !packageJson.scripts?.start) {
        throw new Error('Invalid package.json: missing main entry or start script');
      }
      
      this.log('✅ Build validation passed', 'success');
    } catch (error) {
      this.log(`❌ Build validation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async run() {
    try {
      this.log(`🚀 Starting build process for ${this.target} target...`);
      
      await this.checkPrerequisites();
      await this.cleanBuildDirectory();
      await this.copySourceFiles();
      await this.processAssets();
      await this.optimizeForTarget();
      await this.generateBuildInfo();
      await this.validateBuild();
      
      const duration = Date.now() - this.startTime;
      this.log(`🎉 Build completed successfully in ${duration}ms`, 'success');
      
    } catch (error) {
      this.log(`💥 Build failed: ${error.message}`, 'error');
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
  const builder = new BuildManager(options);
  builder.run();
}

export default BuildManager;
