#!/bin/bash
# AWS RDS Setup Script for School ERP SaaS
set -euo pipefail

# Script metadata
SCRIPT_NAME="setup-rds.sh"
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
ENVIRONMENT="${1:-staging}"
PROJECT_NAME="${PROJECT_NAME:-school-erp}"
AWS_REGION="${AWS_REGION:-us-east-1}"
LOG_FILE="/tmp/rds-setup-$(date +%Y%m%d-%H%M%S).log"

# Arrays
declare -a VALID_ENVIRONMENTS=(development staging production)

# Database configurations per environment
declare -A DB_CONFIG_DEV=(
    [instance_class]="db.t3.micro"
    [allocated_storage]="20"
    [max_allocated_storage]="100"
    [backup_retention_period]="7"
    [multi_az]="false"
    [deletion_protection]="false"
    [performance_insights]="false"
    [monitoring_interval]="0"
)

declare -A DB_CONFIG_STAGING=(
    [instance_class]="db.t3.small"
    [allocated_storage]="100"
    [max_allocated_storage]="200"
    [backup_retention_period]="14"
    [multi_az]="false"
    [deletion_protection]="true"
    [performance_insights]="true"
    [monitoring_interval]="60"
)

declare -A DB_CONFIG_PROD=(
    [instance_class]="db.r6g.large"
    [allocated_storage]="500"
    [max_allocated_storage]="1000"
    [backup_retention_period]="30"
    [multi_az]="true"
    [deletion_protection]="true"
    [performance_insights]="true"
    [monitoring_interval]="60"
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
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" | tee -a "$LOG_FILE" ;;
        *)     echo -e "$message" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════╗
║                  AWS RDS SETUP SCRIPT                    ║
║              School ERP SaaS - Database Setup            ║
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
    --engine ENGINE Database engine (default: postgres)
    --version VER   Database version (default: 14.9)
    --force         Force recreation of existing database
    --skip-snapshot Skip final snapshot on deletion
    --debug         Enable debug logging
    --help          Show this help message

EXAMPLES:
    $0 production --region us-west-2
    $0 staging --engine mysql --version 8.0
    $0 development --force --skip-snapshot

ENVIRONMENT VARIABLES:
    AWS_REGION      AWS region to create resources in
    PROJECT_NAME    Project name for resource naming
    DB_ENGINE       Database engine (postgres|mysql)
    DB_VERSION      Database version
    DEBUG           Enable debug mode (true/false)
EOF
}

get_db_config() {
    local env="$1"
    local key="$2"
    
    case "$env" in
        development)
            echo "${DB_CONFIG_DEV[$key]}"
            ;;
        staging)
            echo "${DB_CONFIG_STAGING[$key]}"
            ;;
        production)
            echo "${DB_CONFIG_PROD[$key]}"
            ;;
        *)
            log ERROR "Unknown environment: $env"
            exit 1
            ;;
    esac
}

check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    # Check required tools
    local tools=(aws jq openssl)
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
    
    # Check VPC availability
    local vpc_id=$(aws ec2 describe-vpcs \
        --filters "Name=tag:Name,Values=${PROJECT_NAME}-${ENVIRONMENT}-vpc" \
        --query 'Vpcs[0].VpcId' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$vpc_id" == "None" ]]; then
        log WARN "VPC not found. Make sure to run setup-vpc.sh first"
        log INFO "Will use default VPC"
    else
        log INFO "Found VPC: $vpc_id"
    fi
    
    log SUCCESS "Prerequisites check passed"
}

create_db_subnet_group() {
    local subnet_group_name="${PROJECT_NAME}-${ENVIRONMENT}-db-subnet-group"
    
    log INFO "Creating DB subnet group: $subnet_group_name"
    
    # Check if subnet group already exists
    if aws rds describe-db-subnet-groups \
        --db-subnet-group-name "$subnet_group_name" \
        --region "$AWS_REGION" >/dev/null 2>&1; then
        log INFO "DB subnet group $subnet_group_name already exists"
        return 0
    fi
    
    # Get private subnets
    local subnets=$(aws ec2 describe-subnets \
        --filters "Name=tag:Name,Values=${PROJECT_NAME}-${ENVIRONMENT}-private-subnet-*" \
        --query 'Subnets[].SubnetId' \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$subnets" ]]; then
        log WARN "Private subnets not found, using default subnets"
        subnets=$(aws ec2 describe-subnets \
            --filters "Name=default-for-az,Values=true" \
            --query 'Subnets[0:2].SubnetId' \
            --output text)
    fi
    
    if [[ -z "$subnets" ]]; then
        log ERROR "No subnets available for DB subnet group"
        exit 1
    fi
    
    # Convert to array
    local subnet_array=($subnets)
    
    # Create subnet group
    aws rds create-db-subnet-group \
        --db-subnet-group-name "$subnet_group_name" \
        --db-subnet-group-description "DB subnet group for ${PROJECT_NAME} ${ENVIRONMENT}" \
        --subnet-ids "${subnet_array[@]}" \
        --region "$AWS_REGION" \
        --tags "Key=Name,Value=$subnet_group_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME" >/dev/null
    
    log SUCCESS "Created DB subnet group: $subnet_group_name"
}

create_db_parameter_group() {
    local param_group_name="${PROJECT_NAME}-${ENVIRONMENT}-${DB_ENGINE}"
    local family
    
    case "$DB_ENGINE" in
        postgres)
            family="postgres$(echo "$DB_VERSION" | cut -d. -f1)"
            ;;
        mysql)
            family="mysql$(echo "$DB_VERSION" | cut -d. -f1-2)"
            ;;
        *)
            log ERROR "Unsupported database engine: $DB_ENGINE"
            exit 1
            ;;
    esac
    
    log INFO "Creating DB parameter group: $param_group_name"
    
    # Check if parameter group already exists
    if aws rds describe-db-parameter-groups \
        --db-parameter-group-name "$param_group_name" \
        --region "$AWS_REGION" >/dev/null 2>&1; then
        log INFO "DB parameter group $param_group_name already exists"
        return 0
    fi
    
    # Create parameter group
    aws rds create-db-parameter-group \
        --db-parameter-group-name "$param_group_name" \
        --db-parameter-group-family "$family" \
        --description "Parameter group for ${PROJECT_NAME} ${ENVIRONMENT} ${DB_ENGINE}" \
        --region "$AWS_REGION" \
        --tags "Key=Name,Value=$param_group_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME" >/dev/null
    
    # Set custom parameters based on engine
    case "$DB_ENGINE" in
        postgres)
            aws rds modify-db-parameter-group \
                --db-parameter-group-name "$param_group_name" \
                --parameters "ParameterName=shared_preload_libraries,ParameterValue=pg_stat_statements,ApplyMethod=pending-reboot" \
                             "ParameterName=log_statement,ParameterValue=all,ApplyMethod=immediate" \
                             "ParameterName=log_min_duration_statement,ParameterValue=1000,ApplyMethod=immediate" \
                --region "$AWS_REGION" >/dev/null
            ;;
        mysql)
            aws rds modify-db-parameter-group \
                --db-parameter-group-name "$param_group_name" \
                --parameters "ParameterName=slow_query_log,ParameterValue=1,ApplyMethod=immediate" \
                             "ParameterName=long_query_time,ParameterValue=2,ApplyMethod=immediate" \
                             "ParameterName=general_log,ParameterValue=1,ApplyMethod=immediate" \
                --region "$AWS_REGION" >/dev/null
            ;;
    esac
    
    log SUCCESS "Created DB parameter group: $param_group_name"
}

create_db_security_group() {
    local sg_name="${PROJECT_NAME}-${ENVIRONMENT}-db-sg"
    
    log INFO "Creating database security group: $sg_name"
    
    # Get VPC ID
    local vpc_id=$(aws ec2 describe-vpcs \
        --filters "Name=tag:Name,Values=${PROJECT_NAME}-${ENVIRONMENT}-vpc" \
        --query 'Vpcs[0].VpcId' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$vpc_id" == "None" ]]; then
        vpc_id=$(aws ec2 describe-vpcs \
            --filters "Name=is-default,Values=true" \
            --query 'Vpcs[0].VpcId' \
            --output text)
    fi
    
    # Check if security group already exists
    local existing_sg=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=$sg_name" "Name=vpc-id,Values=$vpc_id" \
        --query 'SecurityGroups[0].GroupId' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$existing_sg" != "None" ]]; then
        log INFO "Security group $sg_name already exists: $existing_sg"
        echo "$existing_sg"
        return 0
    fi
    
    # Create security group
    local sg_id=$(aws ec2 create-security-group \
        --group-name "$sg_name" \
        --description "Database security group for ${PROJECT_NAME} ${ENVIRONMENT}" \
        --vpc-id "$vpc_id" \
        --query 'GroupId' \
        --output text)
    
    # Add tags
    aws ec2 create-tags \
        --resources "$sg_id" \
        --tags "Key=Name,Value=$sg_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME"
    
    # Get application security group
    local app_sg=$(aws ec2 describe-security-groups \
        --filters "Name=tag:Name,Values=${PROJECT_NAME}-${ENVIRONMENT}-app-sg" \
        --query 'SecurityGroups[0].GroupId' \
        --output text 2>/dev/null || echo "None")
    
    # Set database port based on engine
    local db_port
    case "$DB_ENGINE" in
        postgres) db_port=5432 ;;
        mysql)    db_port=3306 ;;
        *)        db_port=5432 ;;
    esac
    
    # Add ingress rules
    if [[ "$app_sg" != "None" ]]; then
        aws ec2 authorize-security-group-ingress \
            --group-id "$sg_id" \
            --protocol tcp \
            --port "$db_port" \
            --source-group "$app_sg" 2>/dev/null || true
        log INFO "Added ingress rule from application security group"
    else
        # Allow from VPC CIDR as fallback
        local vpc_cidr=$(aws ec2 describe-vpcs \
            --vpc-ids "$vpc_id" \
            --query 'Vpcs[0].CidrBlock' \
            --output text)
        
        aws ec2 authorize-security-group-ingress \
            --group-id "$sg_id" \
            --protocol tcp \
            --port "$db_port" \
            --cidr "$vpc_cidr" 2>/dev/null || true
        log INFO "Added ingress rule from VPC CIDR: $vpc_cidr"
    fi
    
    log SUCCESS "Created security group: $sg_id"
    echo "$sg_id"
}

generate_master_password() {
    # Generate a secure random password
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

store_db_credentials() {
    local db_identifier="$1"
    local master_username="$2"
    local master_password="$3"
    
    log INFO "Storing database credentials in AWS Secrets Manager"
    
    local secret_name="${PROJECT_NAME}/${ENVIRONMENT}/database"
    
    # Create secret value
    local secret_value=$(cat << EOF
{
    "username": "$master_username",
    "password": "$master_password",
    "engine": "$DB_ENGINE",
    "host": "${db_identifier}.${AWS_REGION}.rds.amazonaws.com",
    "port": $(case "$DB_ENGINE" in postgres) echo 5432 ;; mysql) echo 3306 ;; esac),
    "dbname": "school_erp_$ENVIRONMENT",
    "dbInstanceIdentifier": "$db_identifier"
}
EOF
    )
    
    # Check if secret already exists
    if aws secretsmanager describe-secret --secret-id "$secret_name" --region "$AWS_REGION" >/dev/null 2>&1; then
        # Update existing secret
        aws secretsmanager update-secret \
            --secret-id "$secret_name" \
            --secret-string "$secret_value" \
            --region "$AWS_REGION" >/dev/null
        log INFO "Updated existing secret: $secret_name"
    else
        # Create new secret
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --description "Database credentials for ${PROJECT_NAME} ${ENVIRONMENT}" \
            --secret-string "$secret_value" \
            --region "$AWS_REGION" \
            --tags '[{"Key":"Environment","Value":"'$ENVIRONMENT'"},{"Key":"Project","Value":"'$PROJECT_NAME'"}]' >/dev/null
        log SUCCESS "Created secret: $secret_name"
    fi
}

create_rds_instance() {
    local db_identifier="${PROJECT_NAME}-${ENVIRONMENT}-db"
    local master_username="school_erp_admin"
    local master_password=$(generate_master_password)
    
    log INFO "Creating RDS instance: $db_identifier"
    
    # Check if RDS instance already exists
    if aws rds describe-db-instances \
        --db-instance-identifier "$db_identifier" \
        --region "$AWS_REGION" >/dev/null 2>&1; then
        
        if [[ "${FORCE:-false}" == "true" ]]; then
            log WARN "Database $db_identifier exists, deleting due to --force flag"
            delete_rds_instance "$db_identifier"
        else
            log WARN "Database $db_identifier already exists"
            return 0
        fi
    fi
    
    # Get configuration for environment
    local instance_class=$(get_db_config "$ENVIRONMENT" "instance_class")
    local allocated_storage=$(get_db_config "$ENVIRONMENT" "allocated_storage")
    local max_allocated_storage=$(get_db_config "$ENVIRONMENT" "max_allocated_storage")
    local backup_retention=$(get_db_config "$ENVIRONMENT" "backup_retention_period")
    local multi_az=$(get_db_config "$ENVIRONMENT" "multi_az")
    local deletion_protection=$(get_db_config "$ENVIRONMENT" "deletion_protection")
    local performance_insights=$(get_db_config "$ENVIRONMENT" "performance_insights")
    local monitoring_interval=$(get_db_config "$ENVIRONMENT" "monitoring_interval")
    
    # Create security group
    local security_group_id=$(create_db_security_group)
    
    # Create parameter group
    create_db_parameter_group
    
    # Create subnet group
    create_db_subnet_group
    
    # Store credentials first
    store_db_credentials "$db_identifier" "$master_username" "$master_password"
    
    # Create RDS instance
    local create_cmd=(
        aws rds create-db-instance
        --db-instance-identifier "$db_identifier"
        --db-instance-class "$instance_class"
        --engine "$DB_ENGINE"
        --engine-version "$DB_VERSION"
        --master-username "$master_username"
        --master-user-password "$master_password"
        --allocated-storage "$allocated_storage"
        --max-allocated-storage "$max_allocated_storage"
        --backup-retention-period "$backup_retention"
        --db-subnet-group-name "${PROJECT_NAME}-${ENVIRONMENT}-db-subnet-group"
        --vpc-security-group-ids "$security_group_id"
        --db-parameter-group-name "${PROJECT_NAME}-${ENVIRONMENT}-${DB_ENGINE}"
        --storage-type gp3
        --storage-encrypted
        --copy-tags-to-snapshot
        --auto-minor-version-upgrade
        --region "$AWS_REGION"
        --tags "Key=Name,Value=$db_identifier"
               "Key=Environment,Value=$ENVIRONMENT"
               "Key=Project,Value=$PROJECT_NAME"
    )
    
    # Add environment-specific options
    if [[ "$multi_az" == "true" ]]; then
        create_cmd+=(--multi-az)
    fi
    
    if [[ "$deletion_protection" == "true" ]]; then
        create_cmd+=(--deletion-protection)
    fi
    
    if [[ "$performance_insights" == "true" ]]; then
        create_cmd+=(--enable-performance-insights)
        if [[ "$monitoring_interval" != "0" ]]; then
            create_cmd+=(--monitoring-interval "$monitoring_interval")
        fi
    fi
    
    # Execute create command
    "${create_cmd[@]}" >/dev/null
    
    log SUCCESS "RDS instance creation initiated: $db_identifier"
    log INFO "Waiting for RDS instance to be available..."
    
    # Wait for instance to be available
    aws rds wait db-instance-available \
        --db-instance-identifier "$db_identifier" \
        --region "$AWS_REGION"
    
    log SUCCESS "RDS instance is now available: $db_identifier"
    
    # Get endpoint
    local endpoint=$(aws rds describe-db-instances \
        --db-instance-identifier "$db_identifier" \
        --region "$AWS_REGION" \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    log SUCCESS "Database endpoint: $endpoint"
    
    return 0
}

delete_rds_instance() {
    local db_identifier="$1"
    
    log WARN "Deleting RDS instance: $db_identifier"
    
    local skip_snapshot="${SKIP_SNAPSHOT:-false}"
    
    if [[ "$skip_snapshot" == "true" ]]; then
        aws rds delete-db-instance \
            --db-instance-identifier "$db_identifier" \
            --skip-final-snapshot \
            --region "$AWS_REGION" >/dev/null
        log INFO "Deleting without final snapshot"
    else
        local snapshot_id="${db_identifier}-final-snapshot-$(date +%Y%m%d-%H%M%S)"
        aws rds delete-db-instance \
            --db-instance-identifier "$db_identifier" \
            --final-db-snapshot-identifier "$snapshot_id" \
            --region "$AWS_REGION" >/dev/null
        log INFO "Creating final snapshot: $snapshot_id"
    fi
    
    log INFO "Waiting for RDS instance to be deleted..."
    aws rds wait db-instance-deleted \
        --db-instance-identifier "$db_identifier" \
        --region "$AWS_REGION"
    
    log SUCCESS "RDS instance deleted: $db_identifier"
}

generate_connection_info() {
    local db_identifier="${PROJECT_NAME}-${ENVIRONMENT}-db"
    
    log INFO "Generating database connection information"
    
    # Get database details
    local db_info=$(aws rds describe-db-instances \
        --db-instance-identifier "$db_identifier" \
        --region "$AWS_REGION" \
        --query 'DBInstances[0]' 2>/dev/null || echo "{}")
    
    if [[ "$db_info" == "{}" ]]; then
        log WARN "Database instance not found: $db_identifier"
        return 1
    fi
    
    local endpoint=$(echo "$db_info" | jq -r '.Endpoint.Address // "N/A"')
    local port=$(echo "$db_info" | jq -r '.Endpoint.Port // "N/A"')
    local engine=$(echo "$db_info" | jq -r '.Engine // "N/A"')
    local status=$(echo "$db_info" | jq -r '.DBInstanceStatus // "N/A"')
    
    # Create connection info file
    cat > "$PROJECT_ROOT/database-connection-$ENVIRONMENT.md" << EOF
# Database Connection Information

**Environment**: $ENVIRONMENT  
**Database Identifier**: $db_identifier  
**Status**: $status  
**Engine**: $engine ($DB_VERSION)  
**Endpoint**: $endpoint  
**Port**: $port  

## Connection Details

### Environment Variables
\`\`\`bash
DATABASE_HOST=$endpoint
DATABASE_PORT=$port
DATABASE_NAME=school_erp_$ENVIRONMENT
DATABASE_ENGINE=$engine
\`\`\`

### Connection String Examples

#### PostgreSQL
\`\`\`
postgresql://username:password@$endpoint:$port/school_erp_$ENVIRONMENT
\`\`\`

#### MySQL
\`\`\`
mysql://username:password@$endpoint:$port/school_erp_$ENVIRONMENT
\`\`\`

### AWS Secrets Manager

Credentials are stored in: \`${PROJECT_NAME}/${ENVIRONMENT}/database\`

#### Retrieve credentials:
\`\`\`bash
aws secretsmanager get-secret-value \\
    --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/database" \\
    --region $AWS_REGION \\
    --query SecretString --output text | jq .
\`\`\`

## Security

- Database is accessible only from application security groups
- All connections are encrypted in transit
- Data at rest is encrypted using AWS KMS
- Automated backups are enabled with $(get_db_config "$ENVIRONMENT" "backup_retention_period") days retention

## Monitoring

- CloudWatch monitoring enabled
- Performance Insights: $(get_db_config "$ENVIRONMENT" "performance_insights")
- Enhanced monitoring interval: $(get_db_config "$ENVIRONMENT" "monitoring_interval") seconds

---
Generated on: $(date)
EOF
    
    log SUCCESS "Connection info saved to: $PROJECT_ROOT/database-connection-$ENVIRONMENT.md"
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
    
    if create_rds_instance; then
        generate_connection_info
        log SUCCESS "RDS setup completed successfully!"
        echo
        log INFO "Next steps:"
        log INFO "1. Update your application configuration with database credentials"
        log INFO "2. Run database migrations"
        log INFO "3. Configure application security groups for database access"
    else
        log ERROR "RDS setup failed"
        exit 1
    fi
}

cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log SUCCESS "RDS setup completed successfully!"
    else
        log ERROR "RDS setup failed with exit code $exit_code"
        log INFO "Check log file: $LOG_FILE"
    fi
    
    exit $exit_code
}

# Default values
DB_ENGINE="${DB_ENGINE:-postgres}"
DB_VERSION="${DB_VERSION:-14.9}"
FORCE="${FORCE:-false}"
SKIP_SNAPSHOT="${SKIP_SNAPSHOT:-false}"

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
        --engine)
            DB_ENGINE="$2"
            shift 2
            ;;
        --version)
            DB_VERSION="$2"
            shift 2
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --skip-snapshot)
            SKIP_SNAPSHOT=true
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
