#!/bin/bash
# Master Deployment Script - Orchestrates all deployment types

set -euo pipefail

# Script metadata
SCRIPT_NAME="deploy.sh"
SCRIPT_VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m'

# Configuration
DEPLOYMENT_TYPE=${1:-}
ENVIRONMENT=${2:-production}
VERSION=${3:-latest}
FORCE=${FORCE:-false}
DRY_RUN=${DRY_RUN:-false}
SKIP_TESTS=${SKIP_TESTS:-false}
SKIP_MIGRATION=${SKIP_MIGRATION:-false}
SKIP_HEALTH_CHECK=${SKIP_HEALTH_CHECK:-false}
LOG_FILE="/tmp/master-deployment-$(date +%Y%m%d-%H%M%S).log"
ROLLBACK_ON_FAILURE=${ROLLBACK_ON_FAILURE:-true}
NOTIFICATION_WEBHOOK=${NOTIFICATION_WEBHOOK:-}

# Arrays
declare -a VALID_DEPLOYMENT_TYPES=("aws" "docker" "k8s" "vercel" "local")
declare -a VALID_ENVIRONMENTS=("development" "staging" "production" "local")
declare -a PRE_DEPLOYMENT_TASKS=("validate" "test" "migrate")
declare -a POST_DEPLOYMENT_TASKS=("health-check" "smoke-test" "notify")

# Deployment status tracking
declare -A TASK_STATUS
DEPLOYMENT_START_TIME=$(date +%s)
DEPLOYMENT_ID="deploy-$(date +%Y%m%d-%H%M%S)-$$"

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
        DEBUG) [[ "${DEBUG:-}" == "true" ]] && echo -e "${PURPLE}[DEBUG]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        STEP)  echo -e "${CYAN}[STEP]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        *) echo -e "${message}" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║               🎯 MASTER DEPLOYMENT ORCHESTRATOR             ║
║           School ERP SaaS - Complete Deploy Suite           ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Deployment ID: $DEPLOYMENT_ID"
    echo "Type: ${DEPLOYMENT_TYPE:-Not specified}"
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "Log File: $LOG_FILE"
    echo "Started: $(date)"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 <deployment_type> [environment] [version] [options]

DEPLOYMENT TYPES:
    aws         Deploy to AWS using Terraform + EKS
    docker      Deploy using Docker Compose
    k8s         Deploy to existing Kubernetes cluster
    vercel      Deploy to Vercel serverless platform
    local       Local development deployment

ARGUMENTS:
    deployment_type    Target deployment platform (required)
    environment       Target environment (default: production)
    version          Version/tag to deploy (default: latest)

OPTIONS:
    --force           Force deployment without confirmation
    --dry-run         Simulate deployment without making changes
    --skip-tests      Skip pre-deployment tests
    --skip-migration  Skip database migration
    --skip-health     Skip post-deployment health checks
    --rollback        Enable/disable rollback on failure
    --webhook URL     Slack/Teams webhook for notifications
    --debug           Enable debug logging
    --help            Show this help message

EXAMPLES:
    $0 aws production v1.2.0
    $0 docker staging latest --dry-run
    $0 k8s production v1.2.0 --force
    $0 vercel production --skip-tests
    $0 local development --debug

ENVIRONMENT VARIABLES:
    FORCE                 Force deployment (true/false)
    DRY_RUN              Perform dry run (true/false)
    SKIP_TESTS           Skip tests (true/false)
    SKIP_MIGRATION       Skip migration (true/false)
    SKIP_HEALTH_CHECK    Skip health checks (true/false)
    ROLLBACK_ON_FAILURE  Enable rollback (true/false)
    NOTIFICATION_WEBHOOK Notification webhook URL
    DEBUG                Enable debug mode (true/false)
EOF
}

track_task_status() {
    local task=$1
    local status=$2
    local duration=${3:-0}
    
    TASK_STATUS["$task"]="$status:$duration"
    log DEBUG "Task $task: $status (${duration}s)"
}

send_notification() {
    local title="$1"
    local message="$2"
    local color="$3"  # good, warning, danger
    
    if [[ -n "$NOTIFICATION_WEBHOOK" ]]; then
        local duration=$(($(date +%s) - DEPLOYMENT_START_TIME))
        local payload=$(cat << EOF
{
    "text": "🚀 **School ERP Deployment**",
    "attachments": [
        {
            "color": "$color",
            "title": "$title",
            "text": "$message",
            "fields": [
                {
                    "title": "Deployment ID",
                    "value": "$DEPLOYMENT_ID",
                    "short": true
                },
                {
                    "title": "Type",
                    "value": "$DEPLOYMENT_TYPE",
                    "short": true
                },
                {
                    "title": "Environment",
                    "value": "$ENVIRONMENT",
                    "short": true
                },
                {
                    "title": "Version",
                    "value": "$VERSION",
                    "short": true
                },
                {
                    "title": "Duration",
                    "value": "${duration}s",
                    "short": true
                },
                {
                    "title": "Timestamp",
                    "value": "$(date)",
                    "short": true
                }
            ]
        }
    ]
}
EOF
        )
        
        curl -X POST -H 'Content-type: application/json' \
            --data "$payload" "$NOTIFICATION_WEBHOOK" &>/dev/null || true
    fi
}

validate_prerequisites() {
    log STEP "🔍 Validating prerequisites..."
    local start_time=$(date +%s)
    
    # Check required tools
    local tools=("git" "curl" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log ERROR "$tool is not installed or not in PATH"
            track_task_status "validate" "failed" $(($(date +%s) - start_time))
            exit 1
        fi
    done
    
    # Check deployment type specific tools
    case $DEPLOYMENT_TYPE in
        aws)
            if ! command -v terraform &> /dev/null || ! command -v aws &> /dev/null; then
                log ERROR "AWS deployment requires terraform and aws CLI"
                track_task_status "validate" "failed" $(($(date +%s) - start_time))
                exit 1
            fi
            ;;
        docker)
            if ! command -v docker &> /dev/null || ! command -v docker-compose &> /dev/null; then
                log ERROR "Docker deployment requires docker and docker-compose"
                track_task_status "validate" "failed" $(($(date +%s) - start_time))
                exit 1
            fi
            ;;
        k8s)
            if ! command -v kubectl &> /dev/null; then
                log ERROR "Kubernetes deployment requires kubectl"
                track_task_status "validate" "failed" $(($(date +%s) - start_time))
                exit 1
            fi
            ;;
        vercel)
            if ! command -v vercel &> /dev/null; then
                log ERROR "Vercel deployment requires vercel CLI"
                track_task_status "validate" "failed" $(($(date +%s) - start_time))
                exit 1
            fi
            ;;
    esac
    
    # Validate project structure
    local required_files=("package.json" "src/server.js")
    for file in "${required_files[@]}"; do
        if [[ ! -f "$PROJECT_ROOT/$file" ]]; then
            log ERROR "Required file not found: $file"
            track_task_status "validate" "failed" $(($(date +%s) - start_time))
            exit 1
        fi
    done
    
    # Check Git status
    cd "$PROJECT_ROOT"
    if [[ -n "$(git status --porcelain)" ]] && [[ "$FORCE" != "true" ]]; then
        log WARN "Working directory has uncommitted changes"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log ERROR "Aborted due to uncommitted changes"
            exit 1
        fi
    fi
    
    track_task_status "validate" "success" $(($(date +%s) - start_time))
    log SUCCESS "✅ Prerequisites validation passed"
}

run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log INFO "⏭️ Skipping tests (--skip-tests enabled)"
        track_task_status "test" "skipped" 0
        return 0
    fi
    
    log STEP "🧪 Running pre-deployment tests..."
    local start_time=$(date +%s)
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        log INFO "Installing dependencies..."
        npm ci --only=production --no-audit --no-fund
    fi
    
    # Run linting
    log INFO "Running code linting..."
    if ! npm run lint; then
        if [[ "$FORCE" != "true" ]]; then
            log ERROR "Linting failed"
            track_task_status "test" "failed" $(($(date +%s) - start_time))
            exit 1
        else
            log WARN "Linting failed but continuing due to --force"
        fi
    fi
    
    # Run unit tests
    log INFO "Running unit tests..."
    if ! npm run test:ci; then
        log ERROR "Tests failed"
        track_task_status "test" "failed" $(($(date +%s) - start_time))
        exit 1
    fi
    
    # Security audit
    log INFO "Running security audit..."
    if ! npm audit --audit-level moderate; then
        if [[ "$FORCE" != "true" ]]; then
            log ERROR "Security audit failed"
            track_task_status "test" "failed" $(($(date +%s) - start_time))
            exit 1
        else
            log WARN "Security audit failed but continuing due to --force"
        fi
    fi
    
    track_task_status "test" "success" $(($(date +%s) - start_time))
    log SUCCESS "✅ All tests passed"
}

run_migration() {
    if [[ "$SKIP_MIGRATION" == "true" ]]; then
        log INFO "⏭️ Skipping database migration (--skip-migration enabled)"
        track_task_status "migrate" "skipped" 0
        return 0
    fi
    
    log STEP "🗄️ Running database migration..."
    local start_time=$(date +%s)
    
    if [[ -f "$SCRIPT_DIR/migrate.sh" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "🧪 DRY RUN: Would run database migration"
            "$SCRIPT_DIR/migrate.sh" "$ENVIRONMENT" --dry-run
        else
            "$SCRIPT_DIR/migrate.sh" "$ENVIRONMENT" || {
                log ERROR "Database migration failed"
                track_task_status "migrate" "failed" $(($(date +%s) - start_time))
                exit 1
            }
        fi
    else
        log WARN "Migration script not found, skipping"
        track_task_status "migrate" "skipped" $(($(date +%s) - start_time))
        return 0
    fi
    
    track_task_status "migrate" "success" $(($(date +%s) - start_time))
    log SUCCESS "✅ Database migration completed"
}

execute_deployment() {
    log STEP "🚀 Executing $DEPLOYMENT_TYPE deployment..."
    local start_time=$(date +%s)
    
    local deployment_script="$SCRIPT_DIR/deploy-$DEPLOYMENT_TYPE.sh"
    
    if [[ ! -f "$deployment_script" ]]; then
        log ERROR "Deployment script not found: $deployment_script"
        track_task_status "deploy" "failed" $(($(date +%s) - start_time))
        exit 1
    fi
    
    # Build deployment command
    local deploy_cmd="$deployment_script $ENVIRONMENT"
    
    case $DEPLOYMENT_TYPE in
        aws)
            deploy_cmd="$deployment_script $ENVIRONMENT apply"
            if [[ "$DRY_RUN" == "true" ]]; then
                deploy_cmd="$deployment_script $ENVIRONMENT plan"
            fi
            ;;
        docker)
            deploy_cmd="$deployment_script $ENVIRONMENT $VERSION"
            ;;
        k8s)
            deploy_cmd="$deployment_script school-erp $ENVIRONMENT"
            ;;
        vercel)
            deploy_cmd="$deployment_script $ENVIRONMENT"
            ;;
    esac
    
    # Add common flags
    if [[ "$FORCE" == "true" ]]; then
        deploy_cmd="$deploy_cmd --force"
    fi
    if [[ "$DRY_RUN" == "true" ]]; then
        deploy_cmd="$deploy_cmd --dry-run"
    fi
    
    log INFO "Executing: $deploy_cmd"
    
    if eval "$deploy_cmd"; then
        track_task_status "deploy" "success" $(($(date +%s) - start_time))
        log SUCCESS "✅ $DEPLOYMENT_TYPE deployment completed"
    else
        log ERROR "$DEPLOYMENT_TYPE deployment failed"
        track_task_status "deploy" "failed" $(($(date +%s) - start_time))
        return 1
    fi
}

run_health_checks() {
    if [[ "$SKIP_HEALTH_CHECK" == "true" ]]; then
        log INFO "⏭️ Skipping health checks (--skip-health enabled)"
        track_task_status "health-check" "skipped" 0
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would run health checks"
        track_task_status "health-check" "skipped" 0
        return 0
    fi
    
    log STEP "🏥 Running post-deployment health checks..."
    local start_time=$(date +%s)
    
    if [[ -f "$SCRIPT_DIR/health-check.sh" ]]; then
        "$SCRIPT_DIR/health-check.sh" "$ENVIRONMENT" "$DEPLOYMENT_TYPE" || {
            log ERROR "Health checks failed"
            track_task_status "health-check" "failed" $(($(date +%s) - start_time))
            return 1
        }
    else
        log WARN "Health check script not found, skipping"
        track_task_status "health-check" "skipped" $(($(date +%s) - start_time))
        return 0
    fi
    
    track_task_status "health-check" "success" $(($(date +%s) - start_time))
    log SUCCESS "✅ Health checks passed"
}

rollback_deployment() {
    if [[ "$ROLLBACK_ON_FAILURE" != "true" ]]; then
        log INFO "Rollback disabled, skipping"
        return 0
    fi
    
    log WARN "🔄 Initiating rollback procedure..."
    
    case $DEPLOYMENT_TYPE in
        docker)
            log INFO "Rolling back Docker deployment..."
            cd "$PROJECT_ROOT"
            docker-compose -f docker/docker-compose.prod.yml stop || true
            # Restore from backup or previous version
            ;;
        k8s)
            log INFO "Rolling back Kubernetes deployment..."
            kubectl rollout undo deployment/school-erp-api -n school-erp || true
            ;;
        aws)
            log WARN "AWS rollback requires manual intervention or previous Terraform state"
            ;;
        vercel)
            log INFO "Vercel rollback to previous deployment..."
            vercel rollback --yes || true
            ;;
    esac
    
    log WARN "⚠️ Rollback completed - please verify system state"
}

generate_deployment_report() {
    local total_duration=$(($(date +%s) - DEPLOYMENT_START_TIME))
    local report_file="/tmp/deployment-report-$DEPLOYMENT_ID.json"
    
    log STEP "📊 Generating deployment report..."
    
    cat > "$report_file" << EOF
{
    "deploymentId": "$DEPLOYMENT_ID",
    "deploymentType": "$DEPLOYMENT_TYPE",
    "environment": "$ENVIRONMENT",
    "version": "$VERSION",
    "startTime": "$(date -d @$DEPLOYMENT_START_TIME)",
    "endTime": "$(date)",
    "totalDuration": ${total_duration},
    "status": "$(if [[ ${#TASK_STATUS[@]} -gt 0 ]]; then echo "completed"; else echo "failed"; fi)",
    "tasks": {
EOF

    local first=true
    for task in "${!TASK_STATUS[@]}"; do
        if [[ "$first" != "true" ]]; then
            echo "," >> "$report_file"
        fi
        local status_info=(${TASK_STATUS[$task]//:/ })
        local status=${status_info[0]}
        local duration=${status_info[1]:-0}
        
        echo "        \"$task\": {" >> "$report_file"
        echo "            \"status\": \"$status\"," >> "$report_file"
        echo "            \"duration\": $duration" >> "$report_file"
        echo -n "        }" >> "$report_file"
        first=false
    done

    cat >> "$report_file" << EOF

    },
    "logs": "$LOG_FILE",
    "git": {
        "branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
        "commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
        "tag": "$(git describe --tags --exact-match 2>/dev/null || echo 'none')"
    }
}
EOF

    log INFO "📄 Deployment report generated: $report_file"
}

cleanup() {
    local exit_code=$?
    local total_duration=$(($(date +%s) - DEPLOYMENT_START_TIME))
    
    log INFO "🧹 Cleaning up deployment process..."
    
    generate_deployment_report
    
    if [[ $exit_code -eq 0 ]]; then
        log SUCCESS "🎉 Master deployment completed successfully!"
        log INFO "📊 Total deployment time: ${total_duration}s"
        
        # Show task summary
        echo -e "\n${CYAN}📋 Task Summary:${NC}"
        for task in "${!TASK_STATUS[@]}"; do
            local status_info=(${TASK_STATUS[$task]//:/ })
            local status=${status_info[0]}
            local duration=${status_info[1]:-0}
            local icon="✅"
            
            case $status in
                failed) icon="❌" ;;
                skipped) icon="⏭️" ;;
            esac
            
            echo -e "  $icon $task: $status (${duration}s)"
        done
        
        send_notification "Deployment Successful" \
            "Successfully deployed $VERSION to $ENVIRONMENT using $DEPLOYMENT_TYPE" \
            "good"
        
    else
        log ERROR "❌ Master deployment failed with exit code $exit_code"
        log INFO "📝 Check logs: $LOG_FILE"
        log INFO "💡 Duration before failure: ${total_duration}s"
        
        # Attempt rollback
        if [[ "$DRY_RUN" != "true" ]]; then
            rollback_deployment
        fi
        
        send_notification "Deployment Failed" \
            "Deployment failed for $VERSION to $ENVIRONMENT using $DEPLOYMENT_TYPE" \
            "danger"
    fi
    
    exit $exit_code
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-migration)
            SKIP_MIGRATION=true
            shift
            ;;
        --skip-health)
            SKIP_HEALTH_CHECK=true
            shift
            ;;
        --rollback)
            ROLLBACK_ON_FAILURE="$2"
            shift 2
            ;;
        --webhook)
            NOTIFICATION_WEBHOOK="$2"
            shift 2
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            if [[ -z "$DEPLOYMENT_TYPE" ]]; then
                DEPLOYMENT_TYPE=$1
            elif [[ "$ENVIRONMENT" == "production" ]]; then
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
    
    # Validation
    if [[ -z "$DEPLOYMENT_TYPE" ]]; then
        log ERROR "Deployment type is required"
        usage
        exit 1
    fi
    
    if [[ ! " ${VALID_DEPLOYMENT_TYPES[*]} " =~ " $DEPLOYMENT_TYPE " ]]; then
        log ERROR "Invalid deployment type: $DEPLOYMENT_TYPE"
        log INFO "Valid types: ${VALID_DEPLOYMENT_TYPES[*]}"
        exit 1
    fi
    
    if [[ ! " ${VALID_ENVIRONMENTS[*]} " =~ " $ENVIRONMENT " ]]; then
        log ERROR "Invalid environment: $ENVIRONMENT"
        log INFO "Valid environments: ${VALID_ENVIRONMENTS[*]}"
        exit 1
    fi
    
    # Confirmation for production deployments
    if [[ "$ENVIRONMENT" == "production" ]] && [[ "$FORCE" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        log WARN "⚠️ Production deployment requested"
        read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log INFO "Deployment cancelled by user"
            exit 0
        fi
    fi
    
    # Send start notification
    send_notification "Deployment Started" \
        "Starting deployment of $VERSION to $ENVIRONMENT using $DEPLOYMENT_TYPE" \
        "warning"
    
    # Execute deployment pipeline
    validate_prerequisites
    run_tests
    run_migration
    
    if execute_deployment; then
        run_health_checks
        log SUCCESS "🎉 Deployment pipeline completed successfully!"
    else
        log ERROR "💥 Deployment pipeline failed"
        exit 1
    fi
}

# Run main function
main "$@"
