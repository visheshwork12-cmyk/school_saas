#!/bin/bash
# scripts/setup/quick-start.sh

set -e

echo "🚀 School ERP - Development Setup"
echo "=================================="

# Import utilities
source '#utils/core/env-check.sh'

# Check Node.js version
check_node() {
    local required_version="18.0.0"
    if ! command -v node >/dev/null 2>&1; then
        echo "❌ Node.js not found. Please install Node.js >= $required_version"
        exit 1
    fi
    local node_version=$(node -v | cut -d'v' -f2)
    if [ "$(printf '%s\n' "$required_version" "$node_version" | sort -V | head -n1)" != "$required_version" ]; then
        echo "❌ Node.js >= $required_version required. Found: $node_version"
        exit 1
    fi
    echo "✅ Node.js $node_version detected"
}

# Check dependencies
check_dependencies() {
    echo "🔍 Checking system dependencies..."
    local need_docker_setup=false
    if ! command -v mongod >/dev/null 2>&1; then
        echo "⚠️ MongoDB not found. Installing via Docker..."
        need_docker_setup=true
    else
        echo "✅ MongoDB detected"
    fi
    if ! command -v redis-server >/dev/null 2>&1; then
        echo "⚠️ Redis not found. Installing via Docker..."
        need_docker_setup=true
    else
        echo "✅ Redis detected"
    fi
    if [ "$need_docker_setup" = true ] && ! command -v docker >/dev/null 2>&1; then
        echo "❌ Docker required for database setup"
        exit 1
    fi
    return 0
}

# Setup environment
setup_environment() {
    echo "🔧 Setting up development environment..."
    local env_files=(".env" ".env.local")
    for file in "${env_files[@]}"; do
        if [ ! -f "$file" ]; then
            cp "${file}.example" "$file"
            echo "📝 Created $file file from template"
        fi
    done
    if ! grep -q "JWT_SECRET=" .env || grep -q "JWT_SECRET=your-super-secret-jwt-key" .env; then
        local jwt_secret=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
        sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=$jwt_secret/" .env && rm .env.bak
        echo "🔐 Generated new JWT secret"
    fi
    # Validate environment variables
    source '#utils/core/validate-env.js'
    validate_env
}

# Install dependencies
install_dependencies() {
    echo "📦 Installing Node.js dependencies..."
    npm cache clean --force
    npm install --production=false
    echo "🛠️ Installing global development tools..."
    npm install -g nodemon concurrently
    echo "✅ Dependencies installed successfully"
}

# Setup databases
setup_databases() {
    echo "🗄️ Setting up databases..."
    local need_docker_setup=$(check_docker_setup)
    if [ "$need_docker_setup" = true ]; then
        echo "🐳 Starting databases with Docker..."
        docker-compose -f docker/docker-compose.dev.yml up -d mongodb redis
        sleep 10
        # Health check
        if ! docker-compose -f docker/docker-compose.dev.yml exec mongodb mongosh --eval "db.adminCommand({ping: 1})" >/dev/null 2>&1; then
            echo "❌ MongoDB health check failed"
            exit 1
        fi
        if ! docker-compose -f docker/docker-compose.dev.yml exec redis redis-cli ping >/dev/null 2>&1; then
            echo "❌ Redis health check failed"
            exit 1
        fi
        echo "✅ Databases are ready"
    fi
    npm run db:init || {
        echo "❌ Database initialization failed"
        exit 1
    }
}

# Setup Git hooks
setup_git_hooks() {
    echo "🔗 Setting up Git hooks..."
    npm install --save-dev husky
    npx husky install
    npx husky add .husky/pre-commit "npm run lint && npm run test:quick"
    npx husky add .husky/pre-push "npm run test"
    echo "✅ Git hooks configured"
}

# Verify setup
verify_setup() {
    echo "🔍 Verifying setup..."
    if ! npm run db:ping >/dev/null 2>&1; then
        echo "❌ Database connection failed"
        exit 1
    fi
    if ! timeout 30 npm run dev:test >/dev/null 2>&1; then
        echo "❌ Application startup failed"
        exit 1
    fi
    echo "✅ Application starts successfully"
}

# Main execution with audit logging
main() {
    # Audit log start
    logger.info "Starting development setup for tenant: ${TENANT_ID:-default}" '#utils/core/audit-logger.js'
    check_node
    check_dependencies
    setup_environment
    install_dependencies
    setup_databases
    setup_git_hooks
    verify_setup
    logger.info "Development setup completed successfully" '#utils/core/audit-logger.js'
    echo ""
    echo "🎉 Development setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Review your .env file and update configurations"
    echo "2. Start development: npm run dev"
    echo "3. Open API docs: http://localhost:3000/api-docs"
    echo "4. Read the developer guide: docs/developer/"
    echo ""
}

# Execute with error handling
if ! main "$@"; then
    echo "❌ Setup failed. Check logs for details."
    exit 1
fi