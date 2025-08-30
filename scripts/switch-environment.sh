#!/bin/bash
# scripts/switch-environment.sh - Environment switching utility

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration
TARGET_ENV=${1:-}
BACKUP=${BACKUP:-true}
FORCE=${FORCE:-false}

# Arrays
declare -a VALID_ENVIRONMENTS=("development" "staging" "production" "local")

log() {
    local level=$1
    shift
    local message="$*"
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} ${message}" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} ${message}" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${message}" ;;
        SUCCESS) echo -e "${GREEN}[✅]${NC} ${message}" ;;
        *) echo -e "${message}" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║               🔄 ENVIRONMENT SWITCHER                       ║
║           School ERP SaaS - Environment Manager             ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

usage() {
    cat << EOF
Usage: $0 <environment> [options]

ENVIRONMENTS:
    development    Switch to development environment
    staging        Switch to staging environment
    production     Switch to production environment
    local          Switch to local development environment

OPTIONS:
    --no-backup    Skip backing up current .env file
    --force        Force switch without confirmation
    --help         Show this help message

EXAMPLES:
    $0 development
    $0 production --force
    $0 staging --no-backup

ENVIRONMENT VARIABLES:
    BACKUP         Backup current .env (true/false)
    FORCE          Force switch (true/false)
EOF
}

get_current_environment() {
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        local current_env=$(grep "^NODE_ENV=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "unknown")
        echo "$current_env"
    else
        echo "none"
    fi
}

backup_current_env() {
    if [[ "$BACKUP" != "true" ]] || [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        return 0
    fi
    
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_file="$PROJECT_ROOT/.env.backup-$timestamp"
    
    log INFO "📋 Backing up current .env to: .env.backup-$timestamp"
    cp "$PROJECT_ROOT/.env" "$backup_file"
    
    # Keep only last 5 backups
    ls -t "$PROJECT_ROOT"/.env.backup-* 2>/dev/null | tail -n +6 | xargs rm -f || true
}

switch_environment() {
    local target_env="$1"
    local env_file="$PROJECT_ROOT/config/.env.$target_env"
    
    if [[ ! -f "$env_file" ]]; then
        log ERROR "Environment file not found: config/.env.$target_env"
        log INFO "Available environment files:"
        ls -1 "$PROJECT_ROOT/config"/.env.* 2>/dev/null | sed 's/.*\.env\./  - /' || echo "  None found"
        exit 1
    fi
    
    log INFO "🔄 Switching to $target_env environment..."
    
    # Backup current environment
    backup_current_env
    
    # Copy new environment file
    cp "$env_file" "$PROJECT_ROOT/.env"
    
    log SUCCESS "✅ Switched to $target_env environment"
    
    # Show environment details
    show_environment_info "$target_env"
}

show_environment_info() {
    local env="$1"
    
    echo -e "\n${CYAN}📊 Environment Information:${NC}"
    echo -e "  Environment: $env"
    
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        local node_env=$(grep "^NODE_ENV=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "not set")
        local port=$(grep "^PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "not set")
        local db_uri=$(grep "^MONGODB_URI=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "not set")
        
        echo -e "  NODE_ENV: $node_env"
        echo -e "  PORT: $port"
        echo -e "  Database: ${db_uri:0:50}..."
        
        # Show deployment-specific info
        if grep -q "VERCEL" "$PROJECT_ROOT/.env"; then
            echo -e "  Platform: Vercel"
        elif grep -q "KUBERNETES" "$PROJECT_ROOT/.env"; then
            echo -e "  Platform: Kubernetes"
        elif grep -q "DOCKER" "$PROJECT_ROOT/.env"; then
            echo -e "  Platform: Docker"
        else
            echo -e "  Platform: Traditional"
        fi
    fi
    
    echo -e "\n${YELLOW}⚠️  Remember to restart your application!${NC}"
}

validate_environment_switch() {
    local current_env=$(get_current_environment)
    local target_env="$1"
    
    if [[ "$current_env" == "$target_env" ]]; then
        log WARN "Already using $target_env environment"
        return 1
    fi
    
    # Special warnings for production
    if [[ "$target_env" == "production" ]] && [[ "$FORCE" != "true" ]]; then
        log WARN "⚠️ Switching to PRODUCTION environment"
        log WARN "This will connect to production database and services!"
        read -p "Are you sure? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log INFO "Environment switch cancelled"
            return 1
        fi
    fi
    
    return 0
}

list_environments() {
    echo -e "${CYAN}Available Environments:${NC}"
    
    local current_env=$(get_current_environment)
    
    for env in "${VALID_ENVIRONMENTS[@]}"; do
        local env_file="$PROJECT_ROOT/config/.env.$env"
        local status="❌"
        local current=""
        
        if [[ -f "$env_file" ]]; then
            status="✅"
        fi
        
        if [[ "$env" == "$current_env" ]]; then
            current=" ${GREEN}(current)${NC}"
        fi
        
        echo -e "  $status $env$current"
    done
    
    echo ""
    echo -e "${YELLOW}Legend:${NC}"
    echo -e "  ✅ Environment file exists"
    echo -e "  ❌ Environment file missing"
}

check_application_status() {
    local processes=$(pgrep -f "node.*server.js" | wc -l)
    local pm2_processes=$(pm2 list 2>/dev/null | grep -c "online" || echo "0")
    local docker_containers=$(docker ps --filter "name=school-erp" --format "table {{.Names}}" 2>/dev/null | wc -l || echo "0")
    
    if [[ $processes -gt 0 ]] || [[ $pm2_processes -gt 0 ]] || [[ $docker_containers -gt 0 ]]; then
        echo -e "\n${YELLOW}🏃 Application Status:${NC}"
        
        if [[ $processes -gt 0 ]]; then
            echo -e "  Node processes: $processes running"
        fi
        
        if [[ $pm2_processes -gt 0 ]]; then
            echo -e "  PM2 processes: $pm2_processes online"
        fi
        
        if [[ $docker_containers -gt 0 ]]; then
            echo -e "  Docker containers: $((docker_containers - 1)) running"
        fi
        
        echo -e "\n${YELLOW}⚠️  Consider restarting the application to use new environment${NC}"
        
        if command -v pm2 &> /dev/null; then
            echo -e "  Restart with: ${CYAN}pm2 restart school-erp${NC}"
        else
            echo -e "  Restart manually or use: ${CYAN}npm run dev${NC}"
        fi
    fi
}

main() {
    print_banner
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-backup)
                BACKUP=false
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            --list)
                list_environments
                exit 0
                ;;
            *)
                if [[ -z "$TARGET_ENV" ]]; then
                    TARGET_ENV=$1
                else
                    log ERROR "Unknown argument: $1"
                    usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Show current environment and available options
    local current_env=$(get_current_environment)
    echo -e "Current environment: ${GREEN}$current_env${NC}\n"
    
    if [[ -z "$TARGET_ENV" ]]; then
        list_environments
        echo ""
        read -p "Select environment to switch to: " -r TARGET_ENV
    fi
    
    # Validation
    if [[ ! " ${VALID_ENVIRONMENTS[*]} " =~ " $TARGET_ENV " ]]; then
        log ERROR "Invalid environment: $TARGET_ENV"
        log INFO "Valid environments: ${VALID_ENVIRONMENTS[*]}"
        exit 1
    fi
    
    # Validate and switch
    if validate_environment_switch "$TARGET_ENV"; then
        switch_environment "$TARGET_ENV"
        check_application_status
    fi
}

# Execute main function
main "$@"
