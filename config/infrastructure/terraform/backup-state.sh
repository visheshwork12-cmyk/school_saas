#!/bin/bash
# Enhanced Terraform State Backup Script with comprehensive features

set -euo pipefail

# Script metadata
SCRIPT_NAME="backup-state.sh"
SCRIPT_VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration with defaults
ENVIRONMENT=${1:-production}
REGION=${AWS_REGION:-us-east-1}
BUCKET_PREFIX=${TERRAFORM_STATE_BUCKET_PREFIX:-school-erp-terraform-state}
TIMESTAMP=$(date +%Y-%m-%d-%H-%M-%S)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
VERIFY_BACKUP=${VERIFY_BACKUP:-true}
NOTIFICATION_SNS_TOPIC=${BACKUP_NOTIFICATION_TOPIC:-}
LOG_FILE="/tmp/terraform-backup-$(date +%Y%m%d-%H%M%S).log"
DRY_RUN=${DRY_RUN:-false}

# Derived variables
STATE_BUCKET="${BUCKET_PREFIX}-${ENVIRONMENT}-${REGION}"
BACKUP_BUCKET="${BUCKET_PREFIX}-backups-${REGION}"
STATE_KEY="${ENVIRONMENT}/terraform.tfstate"
BACKUP_KEY="backups/${ENVIRONMENT}/${TIMESTAMP}/terraform.tfstate"
LOCK_TABLE="${BUCKET_PREFIX}-locks-${ENVIRONMENT}"

# Arrays for validation
declare -a VALID_ENVIRONMENTS=("development" "staging" "production")
declare -a BACKUP_RESULTS=()

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
        DEBUG) [[ "${DEBUG:-}" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        SUCCESS) echo -e "${GREEN}[✅]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        *) echo -e "${message}" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║           🏗️ TERRAFORM STATE BACKUP MANAGER                 ║
║         School ERP SaaS - Infrastructure Backup             ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Environment: $ENVIRONMENT"
    echo "Region: $REGION"
    echo "State Bucket: $STATE_BUCKET"
    echo "Backup Bucket: $BACKUP_BUCKET"
    echo "Timestamp: $TIMESTAMP"
    echo "Log File: $LOG_FILE"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 [environment] [options]

ARGUMENTS:
    environment       Target environment (development|staging|production)

OPTIONS:
    --region          AWS region (default: us-east-1)
    --retention       Backup retention days (default: 30)
    --no-verify       Skip backup verification
    --dry-run         Simulate backup without making changes
    --force           Force backup even if recent backup exists
    --multi-region    Backup to multiple regions
    --debug           Enable debug logging
    --help            Show this help message

EXAMPLES:
    $0 production
    $0 staging --region us-west-2 --retention 14
    $0 development --dry-run --debug
    $0 production --multi-region --force

ENVIRONMENT VARIABLES:
    AWS_REGION                    AWS region
    TERRAFORM_STATE_BUCKET_PREFIX Bucket name prefix
    BACKUP_RETENTION_DAYS         Backup retention period
    VERIFY_BACKUP                 Enable backup verification (true/false)
    BACKUP_NOTIFICATION_TOPIC     SNS topic for notifications
    DRY_RUN                      Perform dry run (true/false)
EOF
}

check_prerequisites() {
    log INFO "🔍 Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log ERROR "AWS CLI is not installed or not in PATH"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log ERROR "AWS credentials not configured or invalid"
        exit 1
    fi
    
    # Check jq for JSON parsing
    if ! command -v jq &> /dev/null; then
        log WARN "jq is not installed - some features may be limited"
    fi
    
    local aws_account=$(aws sts get-caller-identity --query Account --output text)
    local aws_user=$(aws sts get-caller-identity --query Arn --output text)
    
    log INFO "AWS Account: $aws_account"
    log INFO "AWS User/Role: $aws_user"
    log SUCCESS "✅ Prerequisites check passed"
}

validate_environment() {
    if [[ ! " ${VALID_ENVIRONMENTS[*]} " =~ " $ENVIRONMENT " ]]; then
        log ERROR "Invalid environment: $ENVIRONMENT"
        log INFO "Valid environments: ${VALID_ENVIRONMENTS[*]}"
        exit 1
    fi
}

check_state_bucket_exists() {
    log INFO "📦 Checking state bucket existence..."
    
    if ! aws s3api head-bucket --bucket "$STATE_BUCKET" --region "$REGION" 2>/dev/null; then
        log ERROR "State bucket does not exist: $STATE_BUCKET"
        log INFO "Please ensure Terraform backend is properly configured"
        exit 1
    fi
    
    log SUCCESS "✅ State bucket exists: $STATE_BUCKET"
}

create_backup_bucket() {
    log INFO "🏪 Setting up backup bucket..."
    
    if aws s3api head-bucket --bucket "$BACKUP_BUCKET" --region "$REGION" 2>/dev/null; then
        log INFO "Backup bucket already exists: $BACKUP_BUCKET"
    else
        log INFO "Creating backup bucket: $BACKUP_BUCKET"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "🧪 DRY RUN: Would create backup bucket $BACKUP_BUCKET"
        else
            # Create bucket
            if [[ "$REGION" == "us-east-1" ]]; then
                aws s3api create-bucket --bucket "$BACKUP_BUCKET" --region "$REGION"
            else
                aws s3api create-bucket --bucket "$BACKUP_BUCKET" --region "$REGION" \
                    --create-bucket-configuration LocationConstraint="$REGION"
            fi
            
            # Enable versioning
            aws s3api put-bucket-versioning --bucket "$BACKUP_BUCKET" \
                --versioning-configuration Status=Enabled
            
            # Enable server-side encryption
            aws s3api put-bucket-encryption --bucket "$BACKUP_BUCKET" \
                --server-side-encryption-configuration '{
                    "Rules": [
                        {
                            "ApplyServerSideEncryptionByDefault": {
                                "SSEAlgorithm": "aws:kms"
                            }
                        }
                    ]
                }'
            
            # Block public access
            aws s3api put-public-access-block --bucket "$BACKUP_BUCKET" \
                --public-access-block-configuration \
                "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
            
            # Set lifecycle policy for automatic cleanup
            aws s3api put-bucket-lifecycle-configuration --bucket "$BACKUP_BUCKET" \
                --lifecycle-configuration '{
                    "Rules": [
                        {
                            "ID": "DeleteOldBackups",
                            "Status": "Enabled",
                            "Filter": {
                                "Prefix": "backups/"
                            },
                            "Expiration": {
                                "Days": '$RETENTION_DAYS'
                            },
                            "NoncurrentVersionExpiration": {
                                "NoncurrentDays": 7
                            }
                        }
                    ]
                }'
        fi
    fi
    
    log SUCCESS "✅ Backup bucket ready: $BACKUP_BUCKET"
}

check_recent_backup() {
    log INFO "🔍 Checking for recent backups..."
    
    # Check if backup was created in the last hour
    local one_hour_ago=$(date -u -d '1 hour ago' '+%Y-%m-%d-%H')
    local recent_backups=$(aws s3api list-objects-v2 \
        --bucket "$BACKUP_BUCKET" \
        --prefix "backups/${ENVIRONMENT}/" \
        --query "Contents[?contains(Key, '$one_hour_ago')].Key" \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$recent_backups" ]] && [[ "${FORCE:-false}" != "true" ]]; then
        log WARN "Recent backup found within the last hour:"
        echo "$recent_backups" | tr '\t' '\n'
        read -p "Continue with new backup? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log INFO "Backup cancelled by user"
            exit 0
        fi
    fi
}

get_state_file_info() {
    log INFO "📋 Gathering state file information..."
    
    # Get state file metadata
    local state_info=$(aws s3api head-object \
        --bucket "$STATE_BUCKET" \
        --key "$STATE_KEY" \
        --region "$REGION" 2>/dev/null || echo "{}")
    
    if [[ "$state_info" == "{}" ]]; then
        log ERROR "State file not found: s3://$STATE_BUCKET/$STATE_KEY"
        exit 1
    fi
    
    local last_modified=$(echo "$state_info" | jq -r '.LastModified // "unknown"')
    local size=$(echo "$state_info" | jq -r '.ContentLength // 0')
    local etag=$(echo "$state_info" | jq -r '.ETag // "unknown"')
    
    log INFO "State file last modified: $last_modified"
    log INFO "State file size: $size bytes"
    log INFO "State file ETag: $etag"
    
    # Store for verification
    export ORIGINAL_SIZE="$size"
    export ORIGINAL_ETAG="$etag"
}

perform_backup() {
    log INFO "💾 Starting Terraform state backup..."
    
    local backup_path="s3://$BACKUP_BUCKET/$BACKUP_KEY"
    local state_path="s3://$STATE_BUCKET/$STATE_KEY"
    
    log INFO "Source: $state_path"
    log INFO "Destination: $backup_path"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would backup state from $state_path to $backup_path"
        return 0
    fi
    
    # Perform the backup with metadata
    if aws s3 cp "$state_path" "$backup_path" \
        --region "$REGION" \
        --metadata "environment=$ENVIRONMENT,backup-timestamp=$TIMESTAMP,source-bucket=$STATE_BUCKET" \
        --server-side-encryption aws:kms; then
        
        log SUCCESS "✅ State backup completed successfully"
        BACKUP_RESULTS+=("SUCCESS:$backup_path")
        
        # Add backup metadata file
        local metadata_content=$(cat << EOF
{
    "backup_timestamp": "$TIMESTAMP",
    "environment": "$ENVIRONMENT",
    "source_bucket": "$STATE_BUCKET",
    "source_key": "$STATE_KEY",
    "backup_bucket": "$BACKUP_BUCKET",
    "backup_key": "$BACKUP_KEY",
    "region": "$REGION",
    "original_size": $ORIGINAL_SIZE,
    "original_etag": "$ORIGINAL_ETAG",
    "script_version": "$SCRIPT_VERSION"
}
EOF
        )
        
        echo "$metadata_content" | aws s3 cp - "s3://$BACKUP_BUCKET/backups/${ENVIRONMENT}/${TIMESTAMP}/metadata.json" \
            --region "$REGION" \
            --content-type "application/json"
        
    else
        log ERROR "❌ State backup failed"
        BACKUP_RESULTS+=("FAILED:$backup_path")
        return 1
    fi
}

verify_backup() {
    if [[ "$VERIFY_BACKUP" != "true" ]]; then
        log INFO "⏭️ Skipping backup verification"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would verify backup integrity"
        return 0
    fi
    
    log INFO "🔍 Verifying backup integrity..."
    
    local backup_path="s3://$BACKUP_BUCKET/$BACKUP_KEY"
    
    # Get backup file info
    local backup_info=$(aws s3api head-object \
        --bucket "$BACKUP_BUCKET" \
        --key "$BACKUP_KEY" \
        --region "$REGION" 2>/dev/null || echo "{}")
    
    if [[ "$backup_info" == "{}" ]]; then
        log ERROR "❌ Backup verification failed: file not found"
        return 1
    fi
    
    local backup_size=$(echo "$backup_info" | jq -r '.ContentLength // 0')
    local backup_etag=$(echo "$backup_info" | jq -r '.ETag // "unknown"')
    
    log INFO "Backup size: $backup_size bytes (original: $ORIGINAL_SIZE bytes)"
    log INFO "Backup ETag: $backup_etag (original: $ORIGINAL_ETAG)"
    
    # Verify size and ETag match
    if [[ "$backup_size" == "$ORIGINAL_SIZE" ]] && [[ "$backup_etag" == "$ORIGINAL_ETAG" ]]; then
        log SUCCESS "✅ Backup verification passed"
        return 0
    else
        log ERROR "❌ Backup verification failed: size or ETag mismatch"
        return 1
    fi
}

backup_to_multiple_regions() {
    if [[ "${MULTI_REGION:-false}" != "true" ]]; then
        return 0
    fi
    
    log INFO "🌍 Creating multi-region backups..."
    
    local additional_regions=("us-west-2" "eu-west-1" "ap-southeast-1")
    
    for region in "${additional_regions[@]}"; do
        if [[ "$region" == "$REGION" ]]; then
            continue  # Skip current region
        fi
        
        log INFO "Backing up to region: $region"
        
        local regional_backup_bucket="${BUCKET_PREFIX}-backups-${region}"
        
        # Create bucket in target region if it doesn't exist
        if ! aws s3api head-bucket --bucket "$regional_backup_bucket" --region "$region" 2>/dev/null; then
            log INFO "Creating backup bucket in $region: $regional_backup_bucket"
            
            if [[ "$DRY_RUN" != "true" ]]; then
                aws s3api create-bucket --bucket "$regional_backup_bucket" --region "$region" \
                    --create-bucket-configuration LocationConstraint="$region"
                
                # Configure bucket settings
                aws s3api put-bucket-versioning --bucket "$regional_backup_bucket" \
                    --versioning-configuration Status=Enabled
                aws s3api put-bucket-encryption --bucket "$regional_backup_bucket" \
                    --server-side-encryption-configuration '{
                        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]
                    }'
            fi
        fi
        
        # Copy backup to regional bucket
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "🧪 DRY RUN: Would copy backup to $region"
        else
            aws s3 cp "s3://$BACKUP_BUCKET/$BACKUP_KEY" "s3://$regional_backup_bucket/$BACKUP_KEY" \
                --region "$region" \
                --source-region "$REGION" || {
                log WARN "Failed to backup to region: $region"
                continue
            }
            log SUCCESS "✅ Backup copied to region: $region"
        fi
    done
}

cleanup_old_backups() {
    log INFO "🧹 Cleaning up old backups..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would cleanup backups older than $RETENTION_DAYS days"
        return 0
    fi
    
    # List old backups
    local cutoff_date=$(date -u -d "$RETENTION_DAYS days ago" '+%Y-%m-%d')
    
    local old_backups=$(aws s3api list-objects-v2 \
        --bucket "$BACKUP_BUCKET" \
        --prefix "backups/${ENVIRONMENT}/" \
        --query "Contents[?LastModified<='$cutoff_date'].Key" \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$old_backups" ]]; then
        log INFO "Found old backups to delete:"
        echo "$old_backups" | tr '\t' '\n' | head -5
        
        # Delete old backups
        echo "$old_backups" | tr '\t' '\n' | while read -r key; do
            if [[ -n "$key" ]]; then
                aws s3 rm "s3://$BACKUP_BUCKET/$key" --region "$REGION" || true
                log INFO "Deleted: $key"
            fi
        done
        
        log SUCCESS "✅ Old backup cleanup completed"
    else
        log INFO "No old backups found for cleanup"
    fi
}

send_notification() {
    if [[ -z "$NOTIFICATION_SNS_TOPIC" ]]; then
        return 0
    fi
    
    local status=$1
    local message=$2
    
    log INFO "📢 Sending notification..."
    
    local notification_message=$(cat << EOF
{
    "backup_status": "$status",
    "environment": "$ENVIRONMENT",
    "timestamp": "$TIMESTAMP",
    "region": "$REGION",
    "backup_bucket": "$BACKUP_BUCKET",
    "backup_key": "$BACKUP_KEY",
    "message": "$message",
    "backup_results": [$(IFS=,; echo "${BACKUP_RESULTS[*]}")]
}
EOF
    )
    
    if [[ "$DRY_RUN" != "true" ]]; then
        aws sns publish \
            --topic-arn "$NOTIFICATION_SNS_TOPIC" \
            --subject "Terraform State Backup - $ENVIRONMENT - $status" \
            --message "$notification_message" \
            --region "$REGION" || {
            log WARN "Failed to send notification"
        }
    else
        log INFO "🧪 DRY RUN: Would send notification to $NOTIFICATION_SNS_TOPIC"
    fi
}

generate_backup_report() {
    local report_file="/tmp/terraform-backup-report-$TIMESTAMP.json"
    
    log INFO "📊 Generating backup report..."
    
    cat > "$report_file" << EOF
{
    "backup_id": "$TIMESTAMP",
    "environment": "$ENVIRONMENT",
    "region": "$REGION",
    "timestamp": "$(date -Iseconds)",
    "script_version": "$SCRIPT_VERSION",
    "state_bucket": "$STATE_BUCKET",
    "backup_bucket": "$BACKUP_BUCKET",
    "state_key": "$STATE_KEY",
    "backup_key": "$BACKUP_KEY",
    "dry_run": $DRY_RUN,
    "verification_enabled": $VERIFY_BACKUP,
    "retention_days": $RETENTION_DAYS,
    "results": [
        $(IFS=,; echo "${BACKUP_RESULTS[*]}" | sed 's/,/","/g' | sed 's/^/"/;s/$/"/')
    ],
    "original_state": {
        "size": $ORIGINAL_SIZE,
        "etag": "$ORIGINAL_ETAG"
    }
}
EOF
    
    log INFO "📄 Backup report generated: $report_file"
    
    # Display summary
    echo -e "\n${CYAN}📊 Backup Summary:${NC}"
    echo -e "  Environment: $ENVIRONMENT"
    echo -e "  Timestamp: $TIMESTAMP"
    echo -e "  Backup Bucket: $BACKUP_BUCKET"
    echo -e "  Results: ${#BACKUP_RESULTS[@]} operations"
    
    for result in "${BACKUP_RESULTS[@]}"; do
        local status=$(echo "$result" | cut -d':' -f1)
        local path=$(echo "$result" | cut -d':' -f2-)
        
        if [[ "$status" == "SUCCESS" ]]; then
            echo -e "    ✅ $path"
        else
            echo -e "    ❌ $path"
        fi
    done
}

cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log SUCCESS "✅ Terraform state backup completed successfully"
        send_notification "SUCCESS" "Terraform state backup completed successfully for environment: $ENVIRONMENT"
    else
        log ERROR "❌ Terraform state backup failed with exit code $exit_code"
        log INFO "📝 Check log file: $LOG_FILE"
        send_notification "FAILED" "Terraform state backup failed for environment: $ENVIRONMENT. Check logs for details."
    fi
    
    generate_backup_report
    
    exit $exit_code
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            REGION="$2"
            shift 2
            ;;
        --retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --no-verify)
            VERIFY_BACKUP=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --multi-region)
            MULTI_REGION=true
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
                ENVIRONMENT=$1
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

# Main execution
main() {
    trap cleanup EXIT
    
    print_banner
    
    # Validation
    validate_environment
    
    # Execute backup pipeline
    check_prerequisites
    check_state_bucket_exists
    create_backup_bucket
    check_recent_backup
    get_state_file_info
    
    if perform_backup; then
        verify_backup
        backup_to_multiple_regions
        cleanup_old_backups
        log SUCCESS "🎉 Terraform state backup process completed successfully!"
    else
        log ERROR "💥 Terraform state backup process failed"
        exit 1
    fi
}

# Run main function
main "$@"
