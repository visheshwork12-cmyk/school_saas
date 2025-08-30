#!/usr/bin/env node
// Environment Variable Management Script

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

class EnvironmentManager {
  constructor() {
    this.environments = ['development', 'staging', 'production'];
    this.configPath = path.join(projectRoot, 'config');
  }

  async validateEnvironmentFiles() {
    console.log(chalk.blue('🔍 Validating environment files...'));
    
    for (const env of this.environments) {
      const filePath = path.join(this.configPath, `.env.${env}`);
      
      try {
        await fs.access(filePath);
        console.log(chalk.green(`✅ ${env} environment file exists`));
        
        // Validate required variables
        const content = await fs.readFile(filePath, 'utf8');
        const missingVars = this.checkRequiredVariables(content, env);
        
        if (missingVars.length > 0) {
          console.log(chalk.yellow(`⚠️  Missing variables in ${env}:`));
          missingVars.forEach(variable => {
            console.log(chalk.yellow(`   - ${variable}`));
          });
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ ${env} environment file missing`));
      }
    }
  }

  checkRequiredVariables(content, environment) {
    const required = [
      'NODE_ENV',
      'MONGODB_URI',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET'
    ];

    if (environment === 'production') {
      required.push(
        'AWS_REGION',
        'SES_FROM_EMAIL',
        'SENTRY_DSN'
      );
    }

    const missing = [];
    for (const variable of required) {
      const regex = new RegExp(`^${variable}=`, 'm');
      if (!regex.test(content)) {
        missing.push(variable);
      }
    }

    return missing;
  }

  async generateEnvExample() {
    console.log(chalk.blue('📝 Generating .env.example...'));
    
    const exampleContent = `# Environment Configuration Example
# Copy this file to .env.{environment} and fill in the values

# Server Configuration
NODE_ENV=development
PORT=3000
APP_NAME="School ERP SaaS"

# Database
MONGODB_URI=your-mongodb-uri
JWT_ACCESS_SECRET=your-jwt-access-secret
JWT_REFRESH_SECRET=your-jwt-refresh-secret

# External Services
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-s3-bucket
REDIS_URL=your-redis-url

# For complete configuration, see config/.env.development
`;
    
    const examplePath = path.join(projectRoot, '.env.example');
    await fs.writeFile(examplePath, exampleContent);
    console.log(chalk.green('✅ .env.example generated'));
  }

  async run() {
    console.log(chalk.cyan('🔧 Environment Configuration Manager\n'));
    
    await this.validateEnvironmentFiles();
    await this.generateEnvExample();
    
    console.log(chalk.green('\n✅ Environment validation completed'));
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new EnvironmentManager();
  manager.run().catch(console.error);
}

export default EnvironmentManager;