#!/bin/bash
# AWS Resource Cleanup Script for School ERP SaaS
set -euo pipefail

# Script metadata
SCRIPT_NAME="cleanup-resources.sh"
SCRIPT_VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration
ENVIRONMENT="${1:-}"
PROJECT_NAME="${PROJECT_NAME:-school-erp}"
AWS_REGION="${AWS_REGION:-us-east-1}"
LOG_FILE="/tmp/cleanup-resources-$(date +%Y%m%d-%H%M%S).log"
DRY_RUN="${DRY_RUN:-false}"
FORCE="${FORCE:-false}"

# Arrays
declare -a VALID_ENVIRONMENTS=(development staging production all)
declare -a CLEANUP_SUMMARY=()

# Functions
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" | tee -a "$LOG_FILE" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" | tee -a "$LOG_FILE" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" | tee -a "$LOG_FILE" ;;
        DEBUG) [[ "${DEBUG:-}" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} $message" | tee -a "$LOG_FILE" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" | tee -a "$LOG_FILE" ;;
        *)     echo -e "$message" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════╗
║               AWS RESOURCE CLEANUP SCRIPT                ║
║           School ERP SaaS - Infrastructure Cleanup       ║
╚══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Environment: ${ENVIRONMENT:-All}"
    echo "Project: $PROJECT_NAME"
    echo "Region: $AWS_REGION"
    echo "Dry Run: $DRY_RUN"
    echo "Log File: $LOG_FILE"
    echo
}

usage() {
    cat << EOF
Usage: $0 [environment] [options]

ARGUMENTS:
    environment     Target environment (development|staging|production|all)
                   Leave empty to show resources without deleting

OPTIONS:
    --region REGION AWS region (default: us-east-1)
    --project NAME  Project name (default: school-erp)
    --dry-run       Show what would be deleted without actually deleting
    --force         Force deletion without confirmation
    --debug         Enable debug logging
    --help          Show this help message

EXAMPLES:
    $0                          # List all resources
    $0 development --dry-run    # Show what would be deleted in dev
    $0 staging --force          # Delete staging resources without confirmation
    $0 all --dry-run            # Show all resources that would be deleted

WARNING:
    This script will DELETE AWS resources. Use with caution!
    Always run with --dry-run first to see what will be deleted.

ENVIRONMENT VARIABLES:
    AWS_REGION      AWS region to clean up resources in
    PROJECT_NAME    Project name for resource filtering
    DRY_RUN         Perform dry run (true/false)
    FORCE           Force deletion without confirmation (true/false)
    DEBUG           Enable debug mode (true/false)
EOF
}

check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    # Check required tools
    local tools=(aws jq)
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" >/dev/null; then
            log ERROR "$tool is not installed or not in PATH"
            exit 1
        fi
    done
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log ERROR "AWS credentials not configured or invalid"
        exit 1
    fi
    
    local aws_account=$(aws sts get-caller-identity --query Account --output text)
    local aws_user=$(aws sts get-caller-identity --query Arn --output text)
    
    log INFO "AWS Account: $aws_account"
    log INFO "AWS User: $aws_user"
    log INFO "AWS Region: $AWS_REGION"
    log SUCCESS "Prerequisites check passed"
}

confirm_deletion() {
    local resource_type="$1"
    local resource_count="$2"
    
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi
    
    echo
    log WARN "About to delete $resource_count $resource_type resources"
    read -p "Are you sure you want to proceed? (yes/no): " -r
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log INFO "Deletion cancelled by user"
        return 1
    fi
    
    return 0
}

cleanup_ecr_repositories() {
    local env="$1"
    local filter_pattern
    
    if [[ "$env" == "all" ]]; then
        filter_pattern="$PROJECT_NAME-*"
    else
        filter_pattern="$PROJECT_NAME-*-$env"
    fi
    
    log INFO "Finding ECR repositories matching: $filter_pattern"
    
    local repositories=$(aws ecr describe-repositories \
        --region "$AWS_REGION" \
        --query "repositories[?starts_with(repositoryName, '$PROJECT_NAME')].repositoryName" \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$repositories" ]]; then
        log INFO "No ECR repositories found"
        return 0
    fi
    
    local repo_array=($repositories)
    local filtered_repos=()
    
    for repo in "${repo_array[@]}"; do
        if [[ "$env" == "all" ]] || [[ "$repo" == *"-$env" ]]; then
            filtered_repos+=("$repo")
        fi
    done
    
    if [[ ${#filtered_repos[@]} -eq 0 ]]; then
        log INFO "No ECR repositories found for environment: $env"
        return 0
    fi
    
    log INFO "Found ${#filtered_repos[@]} ECR repositories"
    for repo in "${filtered_repos[@]}"; do
        echo "  - $repo"
    done
    
    if ! confirm_deletion "ECR repository" "${#filtered_repos[@]}"; then
        return 0
    fi
    
    local deleted_count=0
    for repo in "${filtered_repos[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would delete ECR repository: $repo"
        else
            log INFO "Deleting ECR repository: $repo"
            
            # Delete all images first
            local images=$(aws ecr list-images \
                --repository-name "$repo" \
                --region "$AWS_REGION" \
                --query 'imageIds[*]' \
                --output json 2>/dev/null || echo "[]")
            
            if [[ "$images" != "[]" ]] && [[ "$images" != "" ]]; then
                aws ecr batch-delete-image \
                    --repository-name "$repo" \
                    --region "$AWS_REGION" \
                    --image-ids "$images" >/dev/null 2>&1 || true
            fi
            
            # Delete repository
            if aws ecr delete-repository \
                --repository-name "$repo" \
                --region "$AWS_REGION" \
                --force >/dev/null 2>&1; then
                log SUCCESS "Deleted ECR repository: $repo"
                ((deleted_count++))
            else
                log ERROR "Failed to delete ECR repository: $repo"
            fi
        fi
    done
    
    CLEANUP_SUMMARY+=("ECR Repositories: $deleted_count deleted")
}

cleanup_rds_instances() {
    local env="$1"
    local filter_pattern
    
    if [[ "$env" == "all" ]]; then
        filter_pattern="$PROJECT_NAME-*-db"
    else
        filter_pattern="$PROJECT_NAME-$env-db"
    fi
    
    log INFO "Finding RDS instances matching: $filter_pattern"
    
    local instances=$(aws rds describe-db-instances \
        --region "$AWS_REGION" \
        --query "DBInstances[?starts_with(DBInstanceIdentifier, '$PROJECT_NAME')].DBInstanceIdentifier" \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$instances" ]]; then
        log INFO "No RDS instances found"
        return 0
    fi
    
    local instance_array=($instances)
    local filtered_instances=()
    
    for instance in "${instance_array[@]}"; do
        if [[ "$env" == "all" ]] || [[ "$instance" == "$PROJECT_NAME-$env-db" ]]; then
            filtered_instances+=("$instance")
        fi
    done
    
    if [[ ${#filtered_instances[@]} -eq 0 ]]; then
        log INFO "No RDS instances found for environment: $env"
        return 0
    fi
    
    log INFO "Found ${#filtered_instances[@]} RDS instances"
    for instance in "${filtered_instances[@]}"; do
        echo "  - $instance"
    done
    
    if ! confirm_deletion "RDS instance" "${#filtered_instances[@]}"; then
        return 0
    fi
    
    local deleted_count=0
    for instance in "${filtered_instances[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would delete RDS instance: $instance"
        else
            log INFO "Deleting RDS instance: $instance"
            
            local snapshot_id="$instance-final-snapshot-$(date +%Y%m%d-%H%M%S)"
            
            if aws rds delete-db-instance \
                --db-instance-identifier "$instance" \
                --final-db-snapshot-identifier "$snapshot_id" \
                --region "$AWS_REGION" >/dev/null 2>&1; then
                
                log SUCCESS "Initiated deletion of RDS instance: $instance"
                log INFO "Final snapshot will be created: $snapshot_id"
                ((deleted_count++))
            else
                log ERROR "Failed to delete RDS instance: $instance"
            fi
        fi
    done
    
    CLEANUP_SUMMARY+=("RDS Instances: $deleted_count deleted")
}

cleanup_elasticache_clusters() {
    local env="$1"
    local filter_pattern
    
    if [[ "$env" == "all" ]]; then
        filter_pattern="$PROJECT_NAME-*"
    else
        filter_pattern="$PROJECT_NAME-$env-*"
    fi
    
    log INFO "Finding ElastiCache clusters matching: $filter_pattern"
    
    local clusters=$(aws elasticache describe-cache-clusters \
        --region "$AWS_REGION" \
        --query "CacheClusters[?starts_with(CacheClusterId, '$PROJECT_NAME')].CacheClusterId" \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$clusters" ]]; then
        log INFO "No ElastiCache clusters found"
        return 0
    fi
    
    local cluster_array=($clusters)
    local filtered_clusters=()
    
    for cluster in "${cluster_array[@]}"; do
        if [[ "$env" == "all" ]] || [[ "$cluster" == *"-$env-"* ]]; then
            filtered_clusters+=("$cluster")
        fi
    done
    
    if [[ ${#filtered_clusters[@]} -eq 0 ]]; then
        log INFO "No ElastiCache clusters found for environment: $env"
        return 0
    fi
    
    log INFO "Found ${#filtered_clusters[@]} ElastiCache clusters"
    for cluster in "${filtered_clusters[@]}"; do
        echo "  - $cluster"
    done
    
    if ! confirm_deletion "ElastiCache cluster" "${#filtered_clusters[@]}"; then
        return 0
    fi
    
    local deleted_count=0
    for cluster in "${filtered_clusters[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would delete ElastiCache cluster: $cluster"
        else
            log INFO "Deleting ElastiCache cluster: $cluster"
            
            if aws elasticache delete-cache-cluster \
                --cache-cluster-id "$cluster" \
                --region "$AWS_REGION" >/dev/null 2>&1; then
                log SUCCESS "Deleted ElastiCache cluster: $cluster"
                ((deleted_count++))
            else
                log ERROR "Failed to delete ElastiCache cluster: $cluster"
            fi
        fi
    done
    
    CLEANUP_SUMMARY+=("ElastiCache Clusters: $deleted_count deleted")
}

cleanup_load_balancers() {
    local env="$1"
    local filter_pattern
    
    if [[ "$env" == "all" ]]; then
        filter_pattern="$PROJECT_NAME-*"
    else
        filter_pattern="$PROJECT_NAME-$env-*"
    fi
    
    log INFO "Finding Load Balancers matching: $filter_pattern"
    
    local load_balancers=$(aws elbv2 describe-load-balancers \
        --region "$AWS_REGION" \
        --query "LoadBalancers[?starts_with(LoadBalancerName, '$PROJECT_NAME')].LoadBalancerArn" \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$load_balancers" ]]; then
        log INFO "No Load Balancers found"
        return 0
    fi
    
    local lb_array=($load_balancers)
    local filtered_lbs=()
    
    for lb_arn in "${lb_array[@]}"; do
        local lb_name=$(aws elbv2 describe-load-balancers \
            --load-balancer-arns "$lb_arn" \
            --region "$AWS_REGION" \
            --query 'LoadBalancers[0].LoadBalancerName' \
            --output text)
        
        if [[ "$env" == "all" ]] || [[ "$lb_name" == *"-$env-"* ]]; then
            filtered_lbs+=("$lb_arn:$lb_name")
        fi
    done
    
    if [[ ${#filtered_lbs[@]} -eq 0 ]]; then
        log INFO "No Load Balancers found for environment: $env"
        return 0
    fi
    
    log INFO "Found ${#filtered_lbs[@]} Load Balancers"
    for lb_info in "${filtered_lbs[@]}"; do
        local lb_name="${lb_info#*:}"
        echo "  - $lb_name"
    done
    
    if ! confirm_deletion "Load Balancer" "${#filtered_lbs[@]}"; then
        return 0
    fi
    
    local deleted_count=0
    for lb_info in "${filtered_lbs[@]}"; do
        local lb_arn="${lb_info%:*}"
        local lb_name="${lb_info#*:}"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would delete Load Balancer: $lb_name"
        else
            log INFO "Deleting Load Balancer: $lb_name"
            
            if aws elbv2 delete-load-balancer \
                --load-balancer-arn "$lb_arn" \
                --region "$AWS_REGION" >/dev/null 2>&1; then
                log SUCCESS "Deleted Load Balancer: $lb_name"
                ((deleted_count++))
            else
                log ERROR "Failed to delete Load Balancer: $lb_name"
            fi
        fi
    done
    
    CLEANUP_SUMMARY+=("Load Balancers: $deleted_count deleted")
}

cleanup_ecs_services() {
    local env="$1"
    
    log INFO "Finding ECS services for environment: $env"
    
    local clusters=$(aws ecs list-clusters \
        --region "$AWS_REGION" \
        --query 'clusterArns[*]' \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$clusters" ]]; then
        log INFO "No ECS clusters found"
        return 0
    fi
    
    local deleted_count=0
    local cluster_array=($clusters)
    
    for cluster_arn in "${cluster_array[@]}"; do
        local cluster_name=$(basename "$cluster_arn")
        
        if [[ "$env" != "all" ]] && [[ "$cluster_name" != *"-$env"* ]]; then
            continue
        fi
        
        local services=$(aws ecs list-services \
            --cluster "$cluster_arn" \
            --region "$AWS_REGION" \
            --query 'serviceArns[*]' \
            --output text 2>/dev/null || echo "")
        
        if [[ -z "$services" ]]; then
            continue
        fi
        
        local service_array=($services)
        for service_arn in "${service_array[@]}"; do
            local service_name=$(basename "$service_arn")
            
            if [[ "$DRY_RUN" == "true" ]]; then
                log INFO "[DRY RUN] Would delete ECS service: $service_name in cluster: $cluster_name"
            else
                log INFO "Scaling down ECS service: $service_name"
                
                # Scale down to 0
                aws ecs update-service \
                    --cluster "$cluster_arn" \
                    --service "$service_arn" \
                    --desired-count 0 \
                    --region "$AWS_REGION" >/dev/null 2>&1 || true
                
                # Wait for tasks to stop
                aws ecs wait services-stable \
                    --cluster "$cluster_arn" \
                    --services "$service_arn" \
                    --region "$AWS_REGION" || true
                
                # Delete service
                if aws ecs delete-service \
                    --cluster "$cluster_arn" \
                    --service "$service_arn" \
                    --region "$AWS_REGION" >/dev/null 2>&1; then
                    log SUCCESS "Deleted ECS service: $service_name"
                    ((deleted_count++))
                else
                    log ERROR "Failed to delete ECS service: $service_name"
                fi
            fi
        done
    done
    
    CLEANUP_SUMMARY+=("ECS Services: $deleted_count deleted")
}

cleanup_secrets() {
    local env="$1"
    local filter_pattern
    
    if [[ "$env" == "all" ]]; then
        filter_pattern="$PROJECT_NAME/*"
    else
        filter_pattern="$PROJECT_NAME/$env/*"
    fi
    
    log INFO "Finding Secrets Manager secrets matching: $filter_pattern"
    
    local secrets=$(aws secretsmanager list-secrets \
        --region "$AWS_REGION" \
        --query "SecretList[?starts_with(Name, '$PROJECT_NAME')].Name" \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$secrets" ]]; then
        log INFO "No secrets found"
        return 0
    fi
    
    local secret_array=($secrets)
    local filtered_secrets=()
    
    for secret in "${secret_array[@]}"; do
        if [[ "$env" == "all" ]] || [[ "$secret" == "$PROJECT_NAME/$env/"* ]]; then
            filtered_secrets+=("$secret")
        fi
    done
    
    if [[ ${#filtered_secrets[@]} -eq 0 ]]; then
        log INFO "No secrets found for environment: $env"
        return 0
    fi
    
    log INFO "Found ${#filtered_secrets[@]} secrets"
    for secret in "${filtered_secrets[@]}"; do
        echo "  - $secret"
    done
    
    if ! confirm_deletion "Secret" "${#filtered_secrets[@]}"; then
        return 0
    fi
    
    local deleted_count=0
    for secret in "${filtered_secrets[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would delete secret: $secret"
        else
            log INFO "Deleting secret: $secret"
            
            if aws secretsmanager delete-secret \
                --secret-id "$secret" \
                --force-delete-without-recovery \
                --region "$AWS_REGION" >/dev/null 2>&1; then
                log SUCCESS "Deleted secret: $secret"
                ((deleted_count++))
            else
                log ERROR "Failed to delete secret: $secret"
            fi
        fi
    done
    
    CLEANUP_SUMMARY+=("Secrets: $deleted_count deleted")
}

cleanup_s3_buckets() {
    local env="$1"
    local filter_pattern
    
    if [[ "$env" == "all" ]]; then
        filter_pattern="$PROJECT_NAME-*"
    else
        filter_pattern="$PROJECT_NAME-*-$env"
    fi
    
    log INFO "Finding S3 buckets matching: $filter_pattern"
    
    local buckets=$(aws s3api list-buckets \
        --query "Buckets[?starts_with(Name, '$PROJECT_NAME')].Name" \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$buckets" ]]; then
        log INFO "No S3 buckets found"
        return 0
    fi
    
    local bucket_array=($buckets)
    local filtered_buckets=()
    
    for bucket in "${bucket_array[@]}"; do
        if [[ "$env" == "all" ]] || [[ "$bucket" == *"-$env" ]] || [[ "$bucket" == *"-$env-"* ]]; then
            filtered_buckets+=("$bucket")
        fi
    done
    
    if [[ ${#filtered_buckets[@]} -eq 0 ]]; then
        log INFO "No S3 buckets found for environment: $env"
        return 0
    fi
    
    log INFO "Found ${#filtered_buckets[@]} S3 buckets"
    for bucket in "${filtered_buckets[@]}"; do
        echo "  - $bucket"
    done
    
    if ! confirm_deletion "S3 bucket" "${#filtered_buckets[@]}"; then
        return 0
    fi
    
    local deleted_count=0
    for bucket in "${filtered_buckets[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would delete S3 bucket: $bucket"
        else
            log INFO "Deleting S3 bucket: $bucket"
            
            # Empty bucket first
            aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
            
            # Delete bucket
            if aws s3api delete-bucket \
                --bucket "$bucket" \
                --region "$AWS_REGION" >/dev/null 2>&1; then
                log SUCCESS "Deleted S3 bucket: $bucket"
                ((deleted_count++))
            else
                log ERROR "Failed to delete S3 bucket: $bucket"
            fi
        fi
    done
    
    CLEANUP_SUMMARY+=("S3 Buckets: $deleted_count deleted")
}

list_all_resources() {
    log INFO "Listing all resources for project: $PROJECT_NAME"
    
    echo
    log INFO "=== ECR REPOSITORIES ==="
    cleanup_ecr_repositories "all"
    
    echo
    log INFO "=== RDS INSTANCES ==="
    cleanup_rds_instances "all"
    
    echo
    log INFO "=== ELASTICACHE CLUSTERS ==="
    cleanup_elasticache_clusters "all"
    
    echo
    log INFO "=== LOAD BALANCERS ==="
    cleanup_load_balancers "all"
    
    echo
    log INFO "=== ECS SERVICES ==="
    cleanup_ecs_services "all"
    
    echo
    log INFO "=== SECRETS ==="
    cleanup_secrets "all"
    
    echo
    log INFO "=== S3 BUCKETS ==="
    cleanup_s3_buckets "all"
    
    echo
    log INFO "Resource listing completed"
    log WARN "To delete resources, run: $0 <environment> [options]"
}

cleanup_environment() {
    local env="$1"
    
    log INFO "Starting cleanup for environment: $env"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log WARN "DRY RUN MODE - No resources will be actually deleted"
    fi
    
    if [[ "$env" == "all" ]]; then
        log WARN "Cleaning up ALL environments"
    fi
    
    echo
    
    # Cleanup in order (dependencies first)
    cleanup_ecs_services "$env"
    cleanup_load_balancers "$env"
    cleanup_elasticache_clusters "$env"
    cleanup_rds_instances "$env"
    cleanup_ecr_repositories "$env"
    cleanup_secrets "$env"
    cleanup_s3_buckets "$env"
    
    # Display summary
    echo
    log SUCCESS "Cleanup Summary:"
    for summary in "${CLEANUP_SUMMARY[@]}"; do
        echo "  - $summary"
    done
}

# Main execution
main() {
    trap cleanup EXIT
    print_banner
    
    # Show usage if no environment specified
    if [[ -z "$ENVIRONMENT" ]]; then
        log INFO "No environment specified, listing all resources"
        check_prerequisites
        list_all_resources
        return 0
    fi
    
    # Validation
    if [[ ! " ${VALID_ENVIRONMENTS[*]} " =~ " $ENVIRONMENT " ]]; then
        log ERROR "Invalid environment: $ENVIRONMENT"
        log INFO "Valid environments: ${VALID_ENVIRONMENTS
