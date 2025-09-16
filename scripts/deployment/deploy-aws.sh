#!/bin/bash
# Enhanced AWS Deployment Script with comprehensive error handling and features

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Script metadata
SCRIPT_NAME="deploy-aws.sh"
SCRIPT_VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-}
ACTION=${2:-plan}
WORKSPACE=${3:-}
REGION=${AWS_REGION:-us-east-1}
TERRAFORM_VERSION=${TERRAFORM_VERSION:-1.6.0}
STATE_BUCKET_PREFIX="school-erp-terraform-state"
LOG_FILE="/tmp/aws-deployment-$(date +%Y%m%d-%H%M%S).log"
DRY_RUN=${DRY_RUN:-false}
FORCE=${FORCE:-false}
AUTO_APPROVE=${AUTO_APPROVE:-false}

# Arrays for validation
declare -a VALID_ENVIRONMENTS=("development" "staging" "production")
declare -a VALID_ACTIONS=("plan" "apply" "destroy" "validate" "refresh" "import")

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
        *) echo -e "${message}" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║                   🚀 AWS DEPLOYMENT SCRIPT                  ║
║               School ERP SaaS Infrastructure                ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Version: $SCRIPT_VERSION"
    echo "Environment: ${ENVIRONMENT:-Not specified}"
    echo "Action: $ACTION"
    echo "Region: $REGION"
    echo "Log File: $LOG_FILE"
    echo "Time: $(date)"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 <environment> [action] [workspace] [options]

ARGUMENTS:
    environment     Target environment (development|staging|production)
    action         Terraform action (plan|apply|destroy|validate|refresh|import)
    workspace      Terraform workspace name (optional)

OPTIONS:
    --region           AWS region (default: us-east-1)
    --dry-run          Perform dry run without making changes
    --force            Force action without confirmation
    --auto-approve     Auto-approve terraform apply/destroy
    --debug            Enable debug logging
    --help             Show this help message

EXAMPLES:
    $0 production plan
    $0 staging apply --auto-approve
    $0 development destroy --force
    $0 production plan main-workspace --region us-west-2

ENVIRONMENT VARIABLES:
    AWS_REGION         AWS region to deploy to
    TERRAFORM_VERSION  Terraform version to use
    AUTO_APPROVE       Auto-approve destructive actions
    DEBUG              Enable debug mode
    FORCE              Force actions without confirmation
EOF
}

validate_environment() {
    local env=$1
    for valid_env in "${VALID_ENVIRONMENTS[@]}"; do
        if [[ "$env" == "$valid_env" ]]; then
            return 0
        fi
    done
    log ERROR "Invalid environment: $env"
    log INFO "Valid environments: ${VALID_ENVIRONMENTS[*]}"
    exit 1
}

validate_action() {
    local action=$1
    for valid_action in "${VALID_ACTIONS[@]}"; do
        if [[ "$action" == "$valid_action" ]]; then
            return 0
        fi
    done
    log ERROR "Invalid action: $action"
    log INFO "Valid actions: ${VALID_ACTIONS[*]}"
    exit 1
}

check_prerequisites() {
    log INFO "🔍 Checking prerequisites..."
    
    # Check if required tools are installed
    local tools=("terraform" "aws" "jq" "curl")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log ERROR "$tool is not installed or not in PATH"
            exit 1
        fi
    done
    
    # Check Terraform version
    local current_tf_version=$(terraform version -json | jq -r '.terraform_version')
    log INFO "Terraform version: $current_tf_version (required: $TERRAFORM_VERSION)"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log ERROR "AWS credentials not configured or invalid"
        exit 1
    fi
    
    local aws_account=$(aws sts get-caller-identity --query Account --output text)
    local aws_user=$(aws sts get-caller-identity --query Arn --output text)
    log INFO "AWS Account: $aws_account"
    log INFO "AWS User: $aws_user"
    
    # Verify terraform directory exists
    if [[ ! -d "$PROJECT_ROOT/infrastructure/terraform" ]]; then
        log ERROR "Terraform directory not found at $PROJECT_ROOT/infrastructure/terraform"
        exit 1
    fi
    
    # Check if environment tfvars file exists
    local tfvars_file="$PROJECT_ROOT/infrastructure/terraform/environments/$ENVIRONMENT.tfvars"
    if [[ ! -f "$tfvars_file" ]]; then
        log ERROR "Environment tfvars file not found: $tfvars_file"
        exit 1
    fi
    
    log INFO "✅ Prerequisites check passed"
}

backup_state() {
    if [[ "$ACTION" != "plan" && "$ACTION" != "validate" ]]; then
        log INFO "📦 Creating state backup..."
        local backup_dir="$PROJECT_ROOT/backups/terraform/$ENVIRONMENT"
        local backup_file="$backup_dir/terraform-state-backup-$(date +%Y%m%d-%H%M%S).tfstate"
        
        mkdir -p "$backup_dir"
        
        if terraform state pull > "$backup_file" 2>/dev/null; then
            log INFO "State backed up to: $backup_file"
        else
            log WARN "Failed to backup state or no existing state found"
        fi
    fi
}

setup_terraform_backend() {
    log INFO "🔧 Setting up Terraform backend..."
    
    local state_bucket="${STATE_BUCKET_PREFIX}-${ENVIRONMENT}-${REGION}"
    local lock_table="${STATE_BUCKET_PREFIX}-locks-${ENVIRONMENT}"
    
    # Create S3 bucket if it doesn't exist
    if ! aws s3api head-bucket --bucket "$state_bucket" 2>/dev/null; then
        log INFO "Creating S3 bucket: $state_bucket"
        if [[ "$REGION" == "us-east-1" ]]; then
            aws s3api create-bucket --bucket "$state_bucket" --region "$REGION"
        else
            aws s3api create-bucket --bucket "$state_bucket" --region "$REGION" \
                --create-bucket-configuration LocationConstraint="$REGION"
        fi
        
        # Enable versioning
        aws s3api put-bucket-versioning --bucket "$state_bucket" \
            --versioning-configuration Status=Enabled
        
        # Enable server-side encryption
        aws s3api put-bucket-encryption --bucket "$state_bucket" \
            --server-side-encryption-configuration '{
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        }
                    }
                ]
            }'
    fi
    
    # Create DynamoDB table for state locking
    if ! aws dynamodb describe-table --table-name "$lock_table" --region "$REGION" &>/dev/null; then
        log INFO "Creating DynamoDB table: $lock_table"
        aws dynamodb create-table \
            --table-name "$lock_table" \
            --attribute-definitions AttributeName=LockID,AttributeType=S \
            --key-schema AttributeName=LockID,KeyType=HASH \
            --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
            --region "$REGION"
        
        # Wait for table to be active
        aws dynamodb wait table-exists --table-name "$lock_table" --region "$REGION"
    fi
    
    export TF_VAR_state_bucket="$state_bucket"
    export TF_VAR_lock_table="$lock_table"
}

init_terraform() {
    log INFO "🏗️ Initializing Terraform..."
    
    cd "$PROJECT_ROOT/infrastructure/terraform" || exit 1
    
    # Initialize with backend configuration
    terraform init \
        -backend-config="bucket=${STATE_BUCKET_PREFIX}-${ENVIRONMENT}-${REGION}" \
        -backend-config="key=terraform.tfstate" \
        -backend-config="region=$REGION" \
        -backend-config="dynamodb_table=${STATE_BUCKET_PREFIX}-locks-${ENVIRONMENT}" \
        -backend-config="encrypt=true" \
        -input=false \
        -reconfigure
    
    # Set or select workspace if specified
    if [[ -n "$WORKSPACE" ]]; then
        log INFO "Setting up workspace: $WORKSPACE"
        terraform workspace select "$WORKSPACE" 2>/dev/null || terraform workspace new "$WORKSPACE"
    fi
    
    log INFO "✅ Terraform initialized successfully"
}

validate_terraform() {
    log INFO "✅ Validating Terraform configuration..."
    
    # Format check
    if ! terraform fmt -check -recursive; then
        log WARN "Terraform files are not properly formatted"
        if [[ "$FORCE" != "true" ]]; then
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log ERROR "Aborted due to formatting issues"
                exit 1
            fi
        fi
    fi
    
    # Validation
    if ! terraform validate; then
        log ERROR "Terraform configuration validation failed"
        exit 1
    fi
    
    log INFO "✅ Terraform validation passed"
}

security_check() {
    log INFO "🔒 Running security checks..."
    
    # Check for hardcoded secrets (basic check)
    local tfvars_file="environments/$ENVIRONMENT.tfvars"
    if grep -i "password\|secret\|key" "$tfvars_file" | grep -v "arn:" | grep -v "alias/" | grep -q "="; then
        log WARN "Potential hardcoded secrets found in $tfvars_file"
        if [[ "$FORCE" != "true" ]]; then
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log ERROR "Aborted due to security concerns"
                exit 1
            fi
        fi
    fi
    
    # Check for public access in production
    if [[ "$ENVIRONMENT" == "production" ]]; then
        if grep -q "0.0.0.0/0" "$tfvars_file"; then
            log WARN "Open security groups detected in production environment"
            if [[ "$FORCE" != "true" ]]; then
                read -p "Continue anyway? (y/N): " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    log ERROR "Aborted due to security concerns"
                    exit 1
                fi
            fi
        fi
    fi
    
    log INFO "✅ Security checks completed"
}

execute_terraform_action() {
    local action=$1
    local tfvars_file="environments/$ENVIRONMENT.tfvars"
    local plan_file="/tmp/terraform-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).tfplan"
    
    case $action in
        plan)
            log INFO "📋 Creating Terraform plan..."
            terraform plan \
                -var-file="$tfvars_file" \
                -var="environment=$ENVIRONMENT" \
                -var="region=$REGION" \
                -out="$plan_file" \
                -input=false \
                -detailed-exitcode
            
            local exit_code=$?
            case $exit_code in
                0) log INFO "✅ No changes required" ;;
                1) log ERROR "❌ Terraform plan failed"; exit 1 ;;
                2) 
                    log INFO "📝 Changes detected and plan saved to: $plan_file"
                    if [[ "$ENVIRONMENT" == "production" ]]; then
                        log INFO "🔍 Plan summary for production:"
                        terraform show "$plan_file" | head -50
                    fi
                    ;;
            esac
            ;;
            
        apply)
            log INFO "🚀 Applying Terraform changes..."
            
            # Create plan first
            terraform plan \
                -var-file="$tfvars_file" \
                -var="environment=$ENVIRONMENT" \
                -var="region=$REGION" \
                -out="$plan_file" \
                -input=false
            
            # Show plan summary for critical environments
            if [[ "$ENVIRONMENT" == "production" ]] || [[ "$ENVIRONMENT" == "staging" ]]; then
                log INFO "📊 Plan summary:"
                terraform show "$plan_file" | grep -E "Plan:|will be"
                echo
            fi
            
            # Confirmation for destructive actions
            if [[ "$AUTO_APPROVE" != "true" ]]; then
                local changes=$(terraform show "$plan_file" | grep -c "will be" || true)
                if [[ $changes -gt 0 ]]; then
                    log WARN "⚠️  This will make $changes changes to your infrastructure"
                    read -p "Do you want to continue? (yes/no): " -r
                    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
                        log INFO "Deployment cancelled by user"
                        exit 0
                    fi
                fi
            fi
            
            # Apply the plan
            if [[ "$DRY_RUN" == "true" ]]; then
                log INFO "🧪 DRY RUN: Would apply the plan (no actual changes)"
            else
                backup_state
                terraform apply "$plan_file"
                log INFO "✅ Terraform apply completed successfully"
            fi
            ;;
            
        destroy)
            log WARN "💥 DESTROY operation requested for $ENVIRONMENT environment"
            
            if [[ "$ENVIRONMENT" == "production" ]]; then
                log ERROR "❌ Production environment cannot be destroyed without special override"
                if [[ "$FORCE" != "true" ]]; then
                    exit 1
                fi
            fi
            
            # Multiple confirmations for destroy
            if [[ "$AUTO_APPROVE" != "true" ]]; then
                log WARN "⚠️  This will DESTROY all resources in $ENVIRONMENT environment"
                read -p "Type 'destroy-$ENVIRONMENT' to confirm: " -r
                if [[ "$REPLY" != "destroy-$ENVIRONMENT" ]]; then
                    log INFO "Destroy operation cancelled"
                    exit 0
                fi
                
                read -p "Are you absolutely sure? (yes/no): " -r
                if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
                    log INFO "Destroy operation cancelled"
                    exit 0
                fi
            fi
            
            if [[ "$DRY_RUN" == "true" ]]; then
                log INFO "🧪 DRY RUN: Would destroy resources (no actual changes)"
                terraform plan -destroy -var-file="$tfvars_file" -var="environment=$ENVIRONMENT" -var="region=$REGION"
            else
                backup_state
                terraform destroy -var-file="$tfvars_file" -var="environment=$ENVIRONMENT" -var="region=$REGION" -auto-approve
                log INFO "✅ Resources destroyed successfully"
            fi
            ;;
            
        validate)
            validate_terraform
            ;;
            
        refresh)
            log INFO "🔄 Refreshing Terraform state..."
            terraform refresh -var-file="$tfvars_file" -var="environment=$ENVIRONMENT" -var="region=$REGION"
            log INFO "✅ State refreshed successfully"
            ;;
            
        import)
            log ERROR "Import action requires additional parameters. Use terraform import directly."
            exit 1
            ;;
            
        *)
            log ERROR "Unknown action: $action"
            exit 1
            ;;
    esac
}


echo "🔐 Applying CloudFront policies..."

# Apply S3 bucket policy
aws s3api put-bucket-policy \
  --bucket school-erp-static-assets \
  --policy file://security/policies/s3/s3-cloudfront-access-policy.json

# Create CloudFront distribution with policies
terraform apply -var-file="config/infrastructure/terraform/environments/production.tfvars"

echo "✅ CloudFront policies applied successfully!"



# WAF और CloudWatch setup
setup_waf_and_monitoring() {
    log INFO "Setting up WAF and CloudWatch monitoring..."
    
    # Deploy WAF configuration
    cd infrastructure/terraform
    terraform apply -target=aws_wafv2_web_acl.school_erp_waf -auto-approve
    
    # Deploy CloudWatch alarms
    terraform apply -target=aws_cloudwatch_metric_alarm.cloudfront_4xx_errors -auto-approve
    terraform apply -target=aws_cloudwatch_metric_alarm.cloudfront_5xx_errors -auto-approve
    terraform apply -target=aws_cloudwatch_metric_alarm.waf_blocked_requests -auto-approve
    
    # Setup SNS notifications
    terraform apply -target=aws_sns_topic.alerts -auto-approve
    terraform apply -target=aws_sns_topic.security_alerts -auto-approve
    
    log SUCCESS "WAF and monitoring setup completed"
}


# Add these functions to scripts/deployment/deploy-aws.sh

deploy_ecs_infrastructure() {
    log INFO "🚀 Deploying ECS infrastructure..."
    
    # Initialize Terraform
    cd config/infrastructure/terraform
    terraform init
    
    # Plan the deployment
    terraform plan -var-file="environments/${ENVIRONMENT}.tfvars"
    
    # Apply the configuration (with confirmation)
    if [[ "$AUTO_APPROVE" == "true" ]]; then
        terraform apply -var-file="environments/${ENVIRONMENT}.tfvars" -auto-approve
    else
        terraform apply -var-file="environments/${ENVIRONMENT}.tfvars"
    fi
    
    log INFO "✅ ECS infrastructure deployed successfully"
}

monitor_ecs_scaling() {
    log INFO "📊 Monitoring ECS scaling activities..."
    
    # Monitor scaling activities
    aws application-autoscaling describe-scaling-activities \
      --service-namespace ecs \
      --resource-id "service/school-erp-saas-${ENVIRONMENT}-cluster/school-erp-saas-${ENVIRONMENT}-service" \
      --region "${REGION}"
}

test_scaling_policies() {
    log INFO "🧪 Testing ECS scaling policies..."
    
    # Test scaling policies by simulating high CPU
    aws cloudwatch put-metric-data \
      --namespace "AWS/ECS" \
      --metric-data MetricName=CPUUtilization,Value=90.0,Unit=Percent \
      --region "${REGION}"
    
    log INFO "⏰ Waiting for scaling to trigger (check in ~5 minutes)..."
}



post_deployment_checks() {
    if [[ "$ACTION" == "apply" ]] && [[ "$DRY_RUN" != "true" ]]; then
        log INFO "🔍 Running post-deployment checks..."
        
        # Check if outputs are available
        if terraform output &>/dev/null; then
            log INFO "📊 Deployment outputs:"
            terraform output -json | jq -r 'to_entries[] | "\(.key): \(.value.value)"' | head -10
        fi
        
        # Health check if endpoints are available
        local api_endpoint=$(terraform output -raw api_endpoint 2>/dev/null || echo "")
        if [[ -n "$api_endpoint" ]]; then
            log INFO "🏥 Checking API health..."
            if curl -sf "$api_endpoint/health" >/dev/null; then
                log INFO "✅ API health check passed"
            else
                log WARN "⚠️  API health check faile
