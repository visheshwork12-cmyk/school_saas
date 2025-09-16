#!/bin/bash
# AWS ECR Setup Script for School ERP SaaS
set -euo pipefail

# Script metadata
SCRIPT_NAME="setup-ecr.sh"
SCRIPT_VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-staging}"
PROJECT_NAME="${PROJECT_NAME:-school-erp}"
AWS_REGION="${AWS_REGION:-us-east-1}"
LOG_FILE="/tmp/ecr-setup-$(date +%Y%m%d-%H%M%S).log"

# Arrays
declare -a VALID_ENVIRONMENTS=(development staging production)
declare -a ECR_REPOSITORIES=(
    "school-erp-api"
    "school-erp-web"
    "school-erp-worker" 
    "school-erp-nginx"
)

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
        *)     echo -e "$message" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════╗
║                  AWS ECR SETUP SCRIPT                    ║
║              School ERP SaaS - Container Registry        ║
╚══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Environment: $ENVIRONMENT"
    echo "Project: $PROJECT_NAME"
    echo "Region: $AWS_REGION"
    echo "Log File: $LOG_FILE"
    echo
}

usage() {
    cat << EOF
Usage: $0 [environment] [options]

ARGUMENTS:
    environment     Target environment (development|staging|production)

OPTIONS:
    --region REGION AWS region (default: us-east-1)
    --project NAME  Project name (default: school-erp)
    --force         Force recreation of existing repositories
    --debug         Enable debug logging
    --help          Show this help message

EXAMPLES:
    $0 production --region us-west-2
    $0 staging --force
    $0 development --debug

ENVIRONMENT VARIABLES:
    AWS_REGION      AWS region to create resources in
    PROJECT_NAME    Project name for resource naming
    DEBUG           Enable debug mode (true/false)
EOF
}

check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws >/dev/null; then
        log ERROR "AWS CLI is not installed or not in PATH"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log ERROR "AWS credentials not configured or invalid"
        exit 1
    fi
    
    # Check jq
    if ! command -v jq >/dev/null; then
        log ERROR "jq is not installed or not in PATH"
        exit 1
    fi
    
    local aws_account=$(aws sts get-caller-identity --query Account --output text)
    local aws_user=$(aws sts get-caller-identity --query Arn --output text)
    
    log INFO "AWS Account: $aws_account"
    log INFO "AWS User: $aws_user"
    log INFO "AWS Region: $AWS_REGION"
    log SUCCESS "Prerequisites check passed"
}

create_ecr_repository() {
    local repo_name="$1"
    local full_repo_name="${PROJECT_NAME}-${repo_name}-${ENVIRONMENT}"
    
    log INFO "Creating ECR repository: $full_repo_name"
    
    # Check if repository already exists
    if aws ecr describe-repositories --repository-names "$full_repo_name" --region "$AWS_REGION" >/dev/null 2>&1; then
        if [[ "${FORCE:-false}" == "true" ]]; then
            log WARN "Repository $full_repo_name exists, deleting due to --force flag"
            delete_ecr_repository "$full_repo_name"
        else
            log WARN "Repository $full_repo_name already exists, skipping"
            return 0
        fi
    fi
    
    # Create repository
    local repo_uri=$(aws ecr create-repository \
        --repository-name "$full_repo_name" \
        --region "$AWS_REGION" \
        --image-tag-mutability MUTABLE \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256 \
        --query 'repository.repositoryUri' \
        --output text)
    
    if [[ -z "$repo_uri" ]]; then
        log ERROR "Failed to create repository $full_repo_name"
        return 1
    fi
    
    log SUCCESS "Created repository: $repo_uri"
    
    # Set lifecycle policy
    set_lifecycle_policy "$full_repo_name"
    
    # Set repository policy
    set_repository_policy "$full_repo_name"
    
    return 0
}

delete_ecr_repository() {
    local repo_name="$1"
    
    log WARN "Deleting ECR repository: $repo_name"
    
    # Delete all images first
    aws ecr list-images --repository-name "$repo_name" --region "$AWS_REGION" \
        --query 'imageIds[*]' --output json | \
    jq '.[] | select(.imageTag != null) | {imageDigest: .imageDigest, imageTag: .imageTag}' | \
    jq -s '.' > /tmp/images-to-delete.json
    
    if [[ -s /tmp/images-to-delete.json ]] && [[ "$(cat /tmp/images-to-delete.json)" != "[]" ]]; then
        aws ecr batch-delete-image \
            --repository-name "$repo_name" \
            --region "$AWS_REGION" \
            --image-ids file:///tmp/images-to-delete.json >/dev/null
        log INFO "Deleted all images from repository $repo_name"
    fi
    
    # Delete repository
    aws ecr delete-repository \
        --repository-name "$repo_name" \
        --region "$AWS_REGION" \
        --force >/dev/null
    
    log SUCCESS "Deleted repository: $repo_name"
    rm -f /tmp/images-to-delete.json
}

set_lifecycle_policy() {
    local repo_name="$1"
    
    log INFO "Setting lifecycle policy for $repo_name"
    
    # Create lifecycle policy based on environment
    local max_images
    case "$ENVIRONMENT" in
        production) max_images=20 ;;
        staging)    max_images=15 ;;
        *)          max_images=10 ;;
    esac
    
    cat > /tmp/lifecycle-policy.json << EOF
{
    "rules": [
        {
            "rulePriority": 1,
            "description": "Keep last $max_images tagged images",
            "selection": {
                "tagStatus": "tagged",
                "countType": "imageCountMoreThan",
                "countNumber": $max_images
            },
            "action": {
                "type": "expire"
            }
        },
        {
            "rulePriority": 2,
            "description": "Delete untagged images older than 1 day",
            "selection": {
                "tagStatus": "untagged",
                "countType": "sinceImagePushed",
                "countUnit": "days",
                "countNumber": 1
            },
            "action": {
                "type": "expire"
            }
        }
    ]
}
EOF
    
    aws ecr put-lifecycle-policy \
        --repository-name "$repo_name" \
        --region "$AWS_REGION" \
        --lifecycle-policy-text file:///tmp/lifecycle-policy.json >/dev/null
    
    log SUCCESS "Lifecycle policy set for $repo_name"
    rm -f /tmp/lifecycle-policy.json
}

set_repository_policy() {
    local repo_name="$1"
    
    log INFO "Setting repository policy for $repo_name"
    
    # Get current AWS account ID
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    
    # Create repository policy
    cat > /tmp/repository-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowPushPull",
            "Effect": "Allow",
            "Principal": {
                "AWS": [
                    "arn:aws:iam::$account_id:root",
                    "arn:aws:iam::$account_id:role/school-erp-codebuild-role",
                    "arn:aws:iam::$account_id:role/school-erp-ecs-task-role"
                ]
            },
            "Action": [
                "ecr:BatchCheckLayerAvailability",
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer",
                "ecr:PutImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload"
            ]
        }
    ]
}
EOF
    
    aws ecr set-repository-policy \
        --repository-name "$repo_name" \
        --region "$AWS_REGION" \
        --policy-text file:///tmp/repository-policy.json >/dev/null
    
    log SUCCESS "Repository policy set for $repo_name"
    rm -f /tmp/repository-policy.json
}

setup_ecr_repositories() {
    log INFO "Setting up ECR repositories for $ENVIRONMENT environment"
    
    local created_repos=()
    local failed_repos=()
    
    for repo in "${ECR_REPOSITORIES[@]}"; do
        if create_ecr_repository "$repo"; then
            created_repos+=("$repo")
        else
            failed_repos+=("$repo")
        fi
    done
    
    # Summary
    echo
    log INFO "ECR Setup Summary:"
    log INFO "Environment: $ENVIRONMENT"
    log INFO "Region: $AWS_REGION"
    log INFO "Created repositories: ${#created_repos[@]}"
    log INFO "Failed repositories: ${#failed_repos[@]}"
    
    if [[ ${#created_repos[@]} -gt 0 ]]; then
        echo
        log SUCCESS "Successfully created repositories:"
        for repo in "${created_repos[@]}"; do
            local full_name="${PROJECT_NAME}-${repo}-${ENVIRONMENT}"
            local repo_uri="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com/${full_name}"
            echo "  - $repo_uri"
        done
    fi
    
    if [[ ${#failed_repos[@]} -gt 0 ]]; then
        echo
        log ERROR "Failed to create repositories:"
        for repo in "${failed_repos[@]}"; do
            echo "  - ${PROJECT_NAME}-${repo}-${ENVIRONMENT}"
        done
        return 1
    fi
    
    return 0
}

generate_docker_commands() {
    log INFO "Generating Docker commands for ECR repositories"
    
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    local login_cmd="aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $account_id.dkr.ecr.$AWS_REGION.amazonaws.com"
    
    cat > "$PROJECT_ROOT/ecr-commands.sh" << EOF
#!/bin/bash
# Generated ECR commands for $ENVIRONMENT environment
# Generated on: $(date)

# ECR Login Command
echo "Logging into ECR..."
$login_cmd

# Build and Push Commands
EOF
    
    for repo in "${ECR_REPOSITORIES[@]}"; do
        local full_name="${PROJECT_NAME}-${repo}-${ENVIRONMENT}"
        local repo_uri="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com/${full_name}"
        
        cat >> "$PROJECT_ROOT/ecr-commands.sh" << EOF

# $repo
echo "Building and pushing $repo..."
docker build -t $full_name -f docker/Dockerfile.$repo .
docker tag $full_name:latest $repo_uri:latest
docker tag $full_name:latest $repo_uri:\$(git rev-parse --short HEAD)
docker push $repo_uri:latest
docker push $repo_uri:\$(git rev-parse --short HEAD)
EOF
    done
    
    chmod +x "$PROJECT_ROOT/ecr-commands.sh"
    log SUCCESS "ECR commands saved to: $PROJECT_ROOT/ecr-commands.sh"
}

# Main execution
main() {
    trap cleanup EXIT
    print_banner
    
    # Validation
    if [[ ! " ${VALID_ENVIRONMENTS[*]} " =~ " $ENVIRONMENT " ]]; then
        log ERROR "Invalid environment: $ENVIRONMENT"
        log INFO "Valid environments: ${VALID_ENVIRONMENTS[*]}"
        exit 1
    fi
    
    # Execute setup
    check_prerequisites
    
    if setup_ecr_repositories; then
        generate_docker_commands
        log SUCCESS "ECR setup completed successfully!"
    else
        log ERROR "ECR setup failed"
        exit 1
    fi
}

cleanup() {
    local exit_code=$?
    
    # Clean up temporary files
    rm -f /tmp/lifecycle-policy.json /tmp/repository-policy.json /tmp/images-to-delete.json
    
    if [[ $exit_code -eq 0 ]]; then
        log SUCCESS "ECR setup completed successfully!"
    else
        log ERROR "ECR setup failed with exit code $exit_code"
        log INFO "Check log file: $LOG_FILE"
    fi
    
    exit $exit_code
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --project)
            PROJECT_NAME="$2"
            shift 2
            ;;
        --force)
            FORCE=true
            shift
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
            if [[ -z "${ENVIRONMENT_SET:-}" ]]; then
                ENVIRONMENT="$1"
                ENVIRONMENT_SET=true
            else
                log ERROR "Unknown argument: $1"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Run main function
main "$@"
