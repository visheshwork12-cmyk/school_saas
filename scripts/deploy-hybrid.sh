#!/bin/bash
# scripts/deploy-hybrid.sh - Universal hybrid deployment script
# Supports: Traditional, Docker, Kubernetes, AWS, Vercel, Netlify

set -euo pipefail

# Script metadata
SCRIPT_NAME="deploy-hybrid.sh"
SCRIPT_VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m'

# Configuration
DEPLOYMENT_TARGET=${1:-}
ENVIRONMENT=${2:-staging}
VERSION=${3:-latest}
DRY_RUN=${DRY_RUN:-false}
FORCE=${FORCE:-false}
SKIP_TESTS=${SKIP_TESTS:-false}
SKIP_BUILD=${SKIP_BUILD:-false}
VERBOSE=${VERBOSE:-false}
LOG_FILE="/tmp/hybrid-deploy-$(date +%Y%m%d-%H%M%S).log"
DEPLOYMENT_ID="deploy-$(date +%Y%m%d-%H%M%S)-$$"

# Arrays
declare -a VALID_TARGETS=("traditional" "docker" "k8s" "kubernetes" "aws" "vercel" "netlify" "auto")
declare -a VALID_ENVIRONMENTS=("development" "staging" "production")
declare -A DEPLOYMENT_STATUS
declare -A DEPLOYMENT_CONFIG

# Functions
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        DEBUG) [[ "$VERBOSE" == "true" ]] && echo -e "${PURPLE}[DEBUG]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        STEP)  echo -e "${CYAN}[STEP]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        SUCCESS) echo -e "${GREEN}[✅]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        *) echo -e "${message}" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║               🚀 HYBRID DEPLOYMENT MANAGER                  ║
║          School ERP SaaS - Multi-Platform Deploy            ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Deployment ID: $DEPLOYMENT_ID"
    echo "Target: ${DEPLOYMENT_TARGET:-Auto-detect}"
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "Log File: $LOG_FILE"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 <target> [environment] [version] [options]

DEPLOYMENT TARGETS:
    traditional    Deploy to traditional server (PM2/systemd)
    docker        Deploy using Docker containers
    k8s           Deploy to Kubernetes cluster
    aws           Deploy to AWS (EKS + RDS + ElastiCache)
    vercel        Deploy to Vercel serverless platform
    netlify       Deploy to Netlify (limited support)
    auto          Auto-detect deployment target

ARGUMENTS:
    target        Deployment target (required, use 'auto' for detection)
    environment   Target environment (default: staging)
    version       Version/tag to deploy (default: latest)

OPTIONS:
    --dry-run     Simulate deployment without making changes
    --force       Force deployment without confirmation
    --skip-tests  Skip pre-deployment tests
    --skip-build  Skip build process
    --verbose     Enable verbose logging
    --help        Show this help message

EXAMPLES:
    $0 auto production v1.2.0
    $0 docker staging latest --dry-run
    $0 k8s production v1.2.0 --force
    $0 vercel production --skip-tests
    $0 aws staging --verbose

ENVIRONMENT VARIABLES:
    DRY_RUN              Perform dry run (true/false)
    FORCE                Force deployment (true/false)
    SKIP_TESTS           Skip tests (true/false)
    SKIP_BUILD           Skip build (true/false)
    VERBOSE              Enable verbose mode (true/false)
    DEPLOYMENT_CONFIG    Custom deployment config file
EOF
}

detect_deployment_target() {
    log DEBUG "🔍 Auto-detecting deployment target..."
    
    # Check for platform-specific environment variables
    if [[ -n "${VERCEL:-}" ]] || [[ -n "${VERCEL_URL:-}" ]]; then
        echo "vercel"
        return 0
    fi
    
    if [[ -n "${NETLIFY:-}" ]] || [[ -n "${NETLIFY_BUILD_BASE:-}" ]]; then
        echo "netlify"
        return 0
    fi
    
    if [[ -n "${AWS_LAMBDA_FUNCTION_NAME:-}" ]] || [[ -n "${AWS_REGION:-}" ]]; then
        echo "aws"
        return 0
    fi
    
    if [[ -n "${KUBERNETES_SERVICE_HOST:-}" ]] || command -v kubectl &> /dev/null; then
        echo "k8s"
        return 0
    fi
    
    if command -v docker &> /dev/null && docker info &> /dev/null; then
        echo "docker"
        return 0
    fi
    
    # Default to traditional
    echo "traditional"
}

validate_prerequisites() {
    log STEP "🔍 Validating prerequisites..."
    
    # Common prerequisites
    local tools=("git" "node" "npm")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log ERROR "$tool is not installed or not in PATH"
            exit 1
        fi
    done
    
    # Target-specific prerequisites
    case $DEPLOYMENT_TARGET in
        docker)
            if ! command -v docker &> /dev/null; then
                log ERROR "Docker is required for docker deployment"
                exit 1
            fi
            ;;
        k8s|kubernetes)
            if ! command -v kubectl &> /dev/null; then
                log ERROR "kubectl is required for Kubernetes deployment"
                exit 1
            fi
            ;;
        aws)
            if ! command -v aws &> /dev/null || ! command -v terraform &> /dev/null; then
                log ERROR "AWS CLI and Terraform are required for AWS deployment"
                exit 1
            fi
            ;;
        vercel)
            if ! command -v vercel &> /dev/null; then
                log ERROR "Vercel CLI is required for Vercel deployment"
                exit 1
            fi
            ;;
    esac
    
    # Validate project structure
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log ERROR "package.json not found in project root"
        exit 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/src/server.js" ]]; then
        log ERROR "src/server.js not found"
        exit 1
    fi
    
    log SUCCESS "✅ Prerequisites validation passed"
}

load_deployment_config() {
    log STEP "⚙️ Loading deployment configuration..."
    
    local config_file="${DEPLOYMENT_CONFIG:-$PROJECT_ROOT/config/deployment.json}"
    
    if [[ -f "$config_file" ]]; then
        log INFO "Loading config from: $config_file"
        # Load configuration (simplified - in real implementation you'd parse JSON)
        DEPLOYMENT_CONFIG["timeout"]="300"
        DEPLOYMENT_CONFIG["retries"]="3"
        DEPLOYMENT_CONFIG["health_check_url"]="/health"
    else
        log DEBUG "No deployment config file found, using defaults"
        DEPLOYMENT_CONFIG["timeout"]="300"
        DEPLOYMENT_CONFIG["retries"]="3"
        DEPLOYMENT_CONFIG["health_check_url"]="/health"
    fi
    
    # Environment-specific overrides
    case $ENVIRONMENT in
        production)
            DEPLOYMENT_CONFIG["timeout"]="600"
            DEPLOYMENT_CONFIG["retries"]="5"
            ;;
        development)
            DEPLOYMENT_CONFIG["timeout"]="120"
            DEPLOYMENT_CONFIG["retries"]="1"
            ;;
    esac
    
    log DEBUG "Deployment config loaded"
}

run_pre_deployment_checks() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log INFO "⏭️ Skipping pre-deployment checks"
        return 0
    fi
    
    log STEP "🧪 Running pre-deployment checks..."
    
    cd "$PROJECT_ROOT"
    
    # Linting
    log INFO "Running linting..."
    if ! npm run lint; then
        if [[ "$FORCE" != "true" ]]; then
            log ERROR "Linting failed"
            exit 1
        else
            log WARN "Linting failed but continuing due to --force"
        fi
    fi
    
    # Unit tests
    log INFO "Running unit tests..."
    if ! npm run test:ci; then
        if [[ "$FORCE" != "true" ]]; then
            log ERROR "Tests failed"
            exit 1
        else
            log WARN "Tests failed but continuing due to --force"
        fi
    fi
    
    # Security audit
    log INFO "Running security audit..."
    if ! npm audit --audit-level moderate; then
        if [[ "$FORCE" != "true" ]]; then
            log WARN "Security issues found but continuing"
        fi
    fi
    
    log SUCCESS "✅ Pre-deployment checks passed"
}

build_application() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        log INFO "⏭️ Skipping build process"
        return 0
    fi
    
    log STEP "🔨 Building application for $DEPLOYMENT_TARGET..."
    
    cd "$PROJECT_ROOT"
    
    case $DEPLOYMENT_TARGET in
        docker)
            npm run build:docker
            ;;
        aws)
            npm run build:aws
            ;;
        vercel)
            npm run build:vercel
            ;;
        *)
            npm run build
            ;;
    esac
    
    log SUCCESS "✅ Application built successfully"
}

deploy_traditional() {
    log STEP "🏗️ Deploying to traditional server..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would deploy to traditional server"
        return 0
    fi
    
    # Stop existing application
    log INFO "Stopping existing application..."
    if command -v pm2 &> /dev/null; then
        pm2 stop school-erp || true
    else
        pkill -f "node.*server.js" || true
    fi
    
    # Install dependencies
    log INFO "Installing dependencies..."
    npm ci --only=production
    
    # Run database migrations
    log INFO "Running database migrations..."
    npm run db:migrate
    
    # Start application
    log INFO "Starting application..."
    if command -v pm2 &> /dev/null; then
        pm2 start ecosystem.config.js --env $ENVIRONMENT
        pm2 save
    else
        nohup npm start > logs/app.log 2>&1 &
    fi
    
    log SUCCESS "✅ Traditional deployment completed"
}

deploy_docker() {
    log STEP "🐳 Deploying with Docker..."
    
    local image_name="school-erp-saas"
    local image_tag="$VERSION"
    local full_image="$image_name:$image_tag"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would build and deploy Docker image $full_image"
        return 0
    fi
    
    # Build Docker image
    log INFO "Building Docker image: $full_image"
    docker build -t "$full_image" -f docker/Dockerfile.prod .
    
    # Tag as latest if this is production
    if [[ "$ENVIRONMENT" == "production" ]]; then
        docker tag "$full_image" "$image_name:latest"
    fi
    
    # Stop existing container
    log INFO "Stopping existing container..."
    docker stop school-erp-container || true
    docker rm school-erp-container || true
    
    # Run new container
    log INFO "Starting new container..."
    docker run -d \
        --name school-erp-container \
        --restart unless-stopped \
        -p 3000:3000 \
        --env-file ".env.$ENVIRONMENT" \
        "$full_image"
    
    # Health check
    sleep 10
    if ! docker ps | grep -q school-erp-container; then
        log ERROR "Container failed to start"
        docker logs school-erp-container
        exit 1
    fi
    
    log SUCCESS "✅ Docker deployment completed"
}

deploy_kubernetes() {
    log STEP "☸️ Deploying to Kubernetes..."
    
    local namespace="school-erp"
    local deployment_name="school-erp-api"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would deploy to Kubernetes namespace: $namespace"
        return 0
    fi
    
    # Create namespace if it doesn't exist
    kubectl create namespace "$namespace" --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply configuration files
    log INFO "Applying Kubernetes configurations..."
    
    # Apply in order: configmap, secrets, deployment, service, ingress
    local manifests=(
        "k8s/configmap.yaml"
        "k8s/secrets.yaml"
        "k8s/deployment.yaml"
        "k8s/service.yaml"
        "k8s/ingress.yaml"
    )
    
    for manifest in "${manifests[@]}"; do
        if [[ -f "$PROJECT_ROOT/$manifest" ]]; then
            log INFO "Applying $manifest..."
            kubectl apply -f "$PROJECT_ROOT/$manifest" -n "$namespace"
        else
            log WARN "Manifest not found: $manifest"
        fi
    done
    
    # Wait for deployment to be ready
    log INFO "Waiting for deployment to be ready..."
    kubectl rollout status deployment/"$deployment_name" -n "$namespace" --timeout=300s
    
    # Verify pods are running
    local ready_pods=$(kubectl get pods -n "$namespace" -l app="$deployment_name" --field-selector=status.phase=Running --no-headers | wc -l)
    
    if [[ "$ready_pods" -eq 0 ]]; then
        log ERROR "No pods are running"
        kubectl get pods -n "$namespace" -l app="$deployment_name"
        exit 1
    fi
    
    log SUCCESS "✅ Kubernetes deployment completed ($ready_pods pods running)"
}

deploy_aws() {
    log STEP "☁️ Deploying to AWS..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would deploy to AWS using Terraform"
        return 0
    fi
    
    cd "$PROJECT_ROOT/infrastructure/terraform"
    
    # Initialize Terraform
    log INFO "Initializing Terraform..."
    terraform init
    
    # Plan deployment
    log INFO "Planning Terraform deployment..."
    terraform plan \
        -var="environment=$ENVIRONMENT" \
        -var="version=$VERSION" \
        -out="deployment.tfplan"
    
    # Apply if not dry run
    if [[ "$FORCE" == "true" ]] || [[ "$ENVIRONMENT" != "production" ]]; then
        log INFO "Applying Terraform configuration..."
        terraform apply "deployment.tfplan"
    else
        log INFO "Production deployment requires manual approval"
        read -p "Apply Terraform configuration? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            terraform apply "deployment.tfplan"
        else
            log INFO "Deployment cancelled"
            return 1
        fi
    fi
    
    # Get deployment outputs
    local api_endpoint=$(terraform output -raw api_endpoint 2>/dev/null || echo "")
    if [[ -n "$api_endpoint" ]]; then
        log INFO "API endpoint: $api_endpoint"
        DEPLOYMENT_STATUS["endpoint"]="$api_endpoint"
    fi
    
    log SUCCESS "✅ AWS deployment completed"
}

deploy_vercel() {
    log STEP "▲ Deploying to Vercel..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would deploy to Vercel"
        return 0
    fi
    
    # Set environment variables
    log INFO "Setting environment variables..."
    vercel env add NODE_ENV "$ENVIRONMENT" --force || true
    
    # Deploy based on environment
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log INFO "Deploying to production..."
        vercel --prod --force --token="$VERCEL_TOKEN"
    else
        log INFO "Deploying to preview..."
        vercel --force --token="$VERCEL_TOKEN"
    fi
    
    # Get deployment URL
    local deployment_url=$(vercel ls --token="$VERCEL_TOKEN" | head -n 2 | tail -n 1 | awk '{print $2}' || echo "")
    if [[ -n "$deployment_url" ]]; then
        log INFO "Deployment URL: https://$deployment_url"
        DEPLOYMENT_STATUS["endpoint"]="https://$deployment_url"
    fi
    
    log SUCCESS "✅ Vercel deployment completed"
}

deploy_netlify() {
    log STEP "🌐 Deploying to Netlify..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would deploy to Netlify"
        return 0
    fi
    
    # Build for static deployment (if applicable)
    log INFO "Building for Netlify..."
    npm run build
    
    # Deploy using Netlify CLI
    if [[ "$ENVIRONMENT" == "production" ]]; then
        netlify deploy --prod --dir=dist
    else
        netlify deploy --dir=dist
    fi
    
    log SUCCESS "✅ Netlify deployment completed"
}

run_post_deployment_checks() {
    log STEP "🏥 Running post-deployment health checks..."
    
    local endpoint="${DEPLOYMENT_STATUS[endpoint]:-http://localhost:3000}"
    local health_url="$endpoint${DEPLOYMENT_CONFIG[health_check_url]}"
    local timeout="${DEPLOYMENT_CONFIG[timeout]}"
    local retries="${DEPLOYMENT_CONFIG[retries]}"
    
    log INFO "Health check URL: $health_url"
    
    for ((i=1; i<=retries; i++)); do
        log INFO "Health check attempt $i/$retries..."
        
        if curl -f --max-time 30 "$health_url" &>/dev/null; then
            log SUCCESS "✅ Health check passed"
            return 0
        fi
        
        if [[ $i -lt $retries ]]; then
            log WARN "Health check failed, waiting 10 seconds..."
            sleep 10
        fi
    done
    
    log ERROR "❌ Health check failed after $retries attempts"
    
    if [[ "$FORCE" != "true" ]]; then
        exit 1
    else
        log WARN "Continuing despite failed health check due to --force"
    fi
}

run_deployment() {
    log STEP "🚀 Starting deployment to $DEPLOYMENT_TARGET..."
    
    case $DEPLOYMENT_TARGET in
        traditional)
            deploy_traditional
            ;;
        docker)
            deploy_docker
            ;;
        k8s|kubernetes)
            deploy_kubernetes
            ;;
        aws)
            deploy_aws
            ;;
        vercel)
            deploy_vercel
            ;;
        netlify)
            deploy_netlify
            ;;
        *)
            log ERROR "Unsupported deployment target: $DEPLOYMENT_TARGET"
            exit 1
            ;;
    esac
    
    DEPLOYMENT_STATUS["status"]="completed"
    DEPLOYMENT_STATUS["timestamp"]="$(date -Iseconds)"
}

generate_deployment_report() {
    log STEP "📊 Generating deployment report..."
    
    local report_file="/tmp/deployment-report-$DEPLOYMENT_ID.json"
    
    cat > "$report_file" << EOF
{
    "deploymentId": "$DEPLOYMENT_ID",
    "target": "$DEPLOYMENT_TARGET",
    "environment": "$ENVIRONMENT",
    "version": "$VERSION",
    "timestamp": "$(date -Iseconds)",
    "status": "${DEPLOYMENT_STATUS[status]:-unknown}",
    "endpoint": "${DEPLOYMENT_STATUS[endpoint]:-unknown}",
    "logs": "$LOG_FILE",
    "configuration": {
        "dryRun": $DRY_RUN,
        "force": $FORCE,
        "skipTests": $SKIP_TESTS,
        "skipBuild": $SKIP_BUILD
    },
    "system": {
        "user": "${USER:-unknown}",
        "hostname": "$(hostname)",
        "platform": "$(uname -s)",
        "nodeVersion": "$(node --version)"
    }
}
EOF
    
    log INFO "📄 Deployment report: $report_file"
    
    # Display summary
    echo -e "\n${CYAN}📋 Deployment Summary:${NC}"
    echo -e "  Target: $DEPLOYMENT_TARGET"
    echo -e "  Environment: $ENVIRONMENT"
    echo -e "  Version: $VERSION"
    echo -e "  Status: ${DEPLOYMENT_STATUS[status]:-unknown}"
    [[ -n "${DEPLOYMENT_STATUS[endpoint]:-}" ]] && echo -e "  Endpoint: ${DEPLOYMENT_STATUS[endpoint]}"
}

cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log SUCCESS "🎉 Hybrid deployment completed successfully!"
    else
        log ERROR "💥 Deployment failed with exit code $exit_code"
        log INFO "📝 Check logs: $LOG_FILE"
    fi
    
    generate_deployment_report
    
    exit $exit_code
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            if [[ -z "$DEPLOYMENT_TARGET" ]]; then
                DEPLOYMENT_TARGET=$1
            elif [[ "$ENVIRONMENT" == "staging" ]]; then
                ENVIRONMENT=$1
            elif [[ "$VERSION" == "latest" ]]; then
                VERSION=$1
            else
                log ERROR "Unknown argument: $1"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Main execution
main() {
    trap cleanup EXIT
    
    print_banner
    
    # Auto-detect if needed
    if [[ -z "$DEPLOYMENT_TARGET" ]] || [[ "$DEPLOYMENT_TARGET" == "auto" ]]; then
        DEPLOYMENT_TARGET=$(detect_deployment_target)
        log INFO "🔍 Auto-detected deployment target: $DEPLOYMENT_TARGET"
    fi
    
    # Validation
    if [[ ! " ${VALID_TARGETS[*]} " =~ " $DEPLOYMENT_TARGET " ]]; then
        log ERROR "Invalid deployment target: $DEPLOYMENT_TARGET"
        log INFO "Valid targets: ${VALID_TARGETS[*]}"
        exit 1
    fi
    
    if [[ ! " ${VALID_ENVIRONMENTS[*]} " =~ " $ENVIRONMENT " ]]; then
        log ERROR "Invalid environment: $ENVIRONMENT"
        log INFO "Valid environments: ${VALID_ENVIRONMENTS[*]}"
        exit 1
    fi
    
    # Confirmation for production
    if [[ "$ENVIRONMENT" == "production" ]] && [[ "$FORCE" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        log WARN "⚠️ Production deployment requested"
        read -p "Deploy to PRODUCTION environment? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log INFO "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Execute deployment pipeline
    validate_prerequisites
    load_deployment_config
    run_pre_deployment_checks
    build_application
    run_deployment
    run_post_deployment_checks
    
    log SUCCESS "🎉 Hybrid deployment pipeline completed successfully!"
}

# Run main function
main "$@"
