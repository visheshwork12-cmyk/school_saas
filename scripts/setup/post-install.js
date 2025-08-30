#!/usr/bin/env node
// scripts/setup/post-install.js - Post installation setup script

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('🚀 Running post-install setup...');

try {
  // Create necessary directories
  const directories = [
    'logs',
    'uploads',
    'src/core/monitoring/services',
    'src/core/audit/services', 
    'src/core/cache/services',
    'src/core/auth',
    'monitoring/prometheus',
    'security/ssl/certificates/dev',
    'config'
  ];

  directories.forEach(dir => {
    const fullPath = path.join(projectRoot, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  });

  // Create .env.example if it doesn't exist
  const envExample = path.join(projectRoot, '.env.example');
  if (!fs.existsSync(envExample)) {
    const envContent = `# Environment Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
MONGODB_URI=mongodb://localhost:27017/school-erp-dev

# JWT Secrets
JWT_ACCESS_SECRET=your-super-secret-access-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here

# Redis
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=false

# Logging
LOG_LEVEL=info

# Features
ENABLE_API_DOCS=true
ENABLE_METRICS=false
`;
    fs.writeFileSync(envExample, envContent);
    console.log('✅ Created .env.example');
  }

  console.log('🎉 Post-install setup completed successfully!');

} catch (error) {
  console.error('❌ Post-install setup failed:', error);
  process.exit(1);
}
