// scripts/utilities/generate-docs.js

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class DocumentationGenerator {
  
  async generateAll() {
    console.log('🚀 Starting documentation generation...');
    
    try {
      // 1. Generate JSDoc
      await this.generateJSDoc();
      
      // 2. Generate API docs
      await this.generateAPIDoc();
      
      // 3. Generate Postman collections
      await this.generatePostmanCollections();
      
      // 4. Generate README
      await this.generateREADME();
      
      // 5. Generate changelog
      await this.updateChangelog();
      
      console.log('✅ Documentation generation completed!');
      
    } catch (error) {
      console.error('❌ Documentation generation failed:', error);
      process.exit(1);
    }
  }

  async generateJSDoc() {
    console.log('📖 Generating JSDoc documentation...');
    await execAsync('jsdoc -c jsdoc.conf.json');
    console.log('✅ JSDoc generated successfully');
  }

  async generateAPIDoc() {
    console.log('🔗 Generating API documentation...');
    
    // Generate HTML version
    await execAsync('redoc-cli build docs/api/openapi.yaml --output docs/api/html/index.html');
    
    // Copy assets
    await fs.copy('./docs/assets/', './docs/api/html/assets/');
    
    console.log('✅ API documentation generated');
  }

  async generatePostmanCollections() {
    console.log('📮 Generating Postman collections...');
    await execAsync('node scripts/utilities/generate-postman.js');
    console.log('✅ Postman collections generated');
  }

  async generateREADME() {
    console.log('📝 Updating README...');
    
    const readmeTemplate = `
# School Management System

## API Documentation

- **Interactive API Docs**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **ReDoc Documentation**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **Code Documentation**: [./docs/code/index.html](./docs/code/index.html)

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

## API Endpoints

### Authentication
- POST \`/api/v1/auth/login\` - User login
- POST \`/api/v1/auth/logout\` - User logout
- POST \`/api/v1/auth/refresh\` - Refresh token

### Academic Management
- GET \`/api/v1/academic/classes\` - Get all classes
- POST \`/api/v1/academic/classes\` - Create new class

## Documentation

- [Setup Guide](./docs/developer/setup-guide.md)
- [API Reference](./docs/api/)
- [Architecture](./docs/architecture/)
`;

    await fs.writeFile('./README.md', readmeTemplate);
    console.log('✅ README updated');
  }

  async updateChangelog() {
    console.log('📋 Updating changelog...');
    
    const changelogEntry = `
## [${new Date().toISOString().split('T')[0]}] - Documentation Update

### Added
- Complete API documentation with Swagger/OpenAPI
- Interactive API explorer
- JSDoc code documentation
- Postman collections
- Updated README with documentation links

### Changed
- Improved error response schemas
- Enhanced authentication documentation

`;

    const existingChangelog = await fs.readFile('./CHANGELOG.md', 'utf8');
    const newChangelog = changelogEntry + existingChangelog;
    
    await fs.writeFile('./CHANGELOG.md', newChangelog);
    console.log('✅ Changelog updated');
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new DocumentationGenerator();
  generator.generateAll();
}

module.exports = DocumentationGenerator;
