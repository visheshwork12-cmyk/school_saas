#!/bin/bash
# AWS VPC Setup Script for School ERP SaaS
set -euo pipefail

# Script metadata
SCRIPT_NAME="setup-vpc.sh"
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
LOG_FILE="/tmp/vpc-setup-$(date +%Y%m%d-%H%M%S).log"

# Network configuration
VPC_CIDR="${VPC_CIDR:-10.0.0.0/16}"
PUBLIC_SUBNET_CIDRS=("10.0.1.0/24" "10.0.2.0/24")
PRIVATE_SUBNET_CIDRS=("10.0.10.0/24" "10.0.20.0/24")
DATABASE_SUBNET_CIDRS=("10.0.50.0/24" "10.0.60.0/24")

# Arrays
declare -a VALID_ENVIRONMENTS=(development staging production)
declare -a AVAILABILITY_ZONES=()

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
║                  AWS VPC SETUP SCRIPT                    ║
║           School ERP SaaS - Network Infrastructure       ║
╚══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Environment: $ENVIRONMENT"
    echo "Project: $PROJECT_NAME"
    echo "Region: $AWS_REGION"
    echo "VPC CIDR: $VPC_CIDR"
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
    --cidr CIDR     VPC CIDR block (default: 10.0.0.0/16)
    --force         Force recreation of existing VPC
    --debug         Enable debug logging
    --help          Show this help message

EXAMPLES:
    $0 production --region us-west-2
    $0 staging --cidr 172.16.0.0/16
    $0 development --force

ENVIRONMENT VARIABLES:
    AWS_REGION      AWS region to create resources in
    PROJECT_NAME    Project name for resource naming
    VPC_CIDR        VPC CIDR block
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
    
    # Get availability zones
    mapfile -t AVAILABILITY_ZONES < <(aws ec2 describe-availability-zones \
        --region "$AWS_REGION" \
        --query 'AvailabilityZones[0:2].ZoneName' \
        --output text | tr '\t' '\n')
    
    if [[ ${#AVAILABILITY_ZONES[@]} -lt 2 ]]; then
        log ERROR "Need at least 2 availability zones in region $AWS_REGION"
        exit 1
    fi
    
    log INFO "Using availability zones: ${AVAILABILITY_ZONES[*]}"
    log SUCCESS "Prerequisites check passed"
}

create_vpc() {
    local vpc_name="${PROJECT_NAME}-${ENVIRONMENT}-vpc"
    
    log INFO "Creating VPC: $vpc_name"
    
    # Check if VPC already exists
    local existing_vpc=$(aws ec2 describe-vpcs \
        --filters "Name=tag:Name,Values=$vpc_name" \
        --query 'Vpcs[0].VpcId' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$existing_vpc" != "None" ]]; then
        if [[ "${FORCE:-false}" == "true" ]]; then
            log WARN "VPC $vpc_name exists, deleting due to --force flag"
            delete_vpc "$existing_vpc"
        else
            log WARN "VPC $vpc_name already exists: $existing_vpc"
            echo "$existing_vpc"
            return 0
        fi
    fi
    
    # Create VPC
    local vpc_id=$(aws ec2 create-vpc \
        --cidr-block "$VPC_CIDR" \
        --query 'Vpc.VpcId' \
        --output text)
    
    if [[ -z "$vpc_id" ]]; then
        log ERROR "Failed to create VPC"
        exit 1
    fi
    
    # Add tags
    aws ec2 create-tags \
        --resources "$vpc_id" \
        --tags "Key=Name,Value=$vpc_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME"
    
    # Enable DNS hostnames and resolution
    aws ec2 modify-vpc-attribute --vpc-id "$vpc_id" --enable-dns-hostnames
    aws ec2 modify-vpc-attribute --vpc-id "$vpc_id" --enable-dns-support
    
    # Wait for VPC to be available
    aws ec2 wait vpc-available --vpc-ids "$vpc_id"
    
    log SUCCESS "Created VPC: $vpc_id ($VPC_CIDR)"
    echo "$vpc_id"
}

create_internet_gateway() {
    local vpc_id="$1"
    local igw_name="${PROJECT_NAME}-${ENVIRONMENT}-igw"
    
    log INFO "Creating Internet Gateway: $igw_name"
    
    # Check if IGW already exists
    local existing_igw=$(aws ec2 describe-internet-gateways \
        --filters "Name=tag:Name,Values=$igw_name" \
        --query 'InternetGateways[0].InternetGatewayId' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$existing_igw" != "None" ]]; then
        log INFO "Internet Gateway $igw_name already exists: $existing_igw"
        echo "$existing_igw"
        return 0
    fi
    
    # Create Internet Gateway
    local igw_id=$(aws ec2 create-internet-gateway \
        --query 'InternetGateway.InternetGatewayId' \
        --output text)
    
    # Add tags
    aws ec2 create-tags \
        --resources "$igw_id" \
        --tags "Key=Name,Value=$igw_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME"
    
    # Attach to VPC
    aws ec2 attach-internet-gateway \
        --internet-gateway-id "$igw_id" \
        --vpc-id "$vpc_id"
    
    log SUCCESS "Created and attached Internet Gateway: $igw_id"
    echo "$igw_id"
}

create_subnets() {
    local vpc_id="$1"
    local subnet_type="$2"  # public, private, database
    local -n cidr_array=$3
    
    log INFO "Creating $subnet_type subnets"
    
    local subnet_ids=()
    
    for i in "${!cidr_array[@]}"; do
        local cidr="${cidr_array[$i]}"
        local az="${AVAILABILITY_ZONES[$i]}"
        local subnet_name="${PROJECT_NAME}-${ENVIRONMENT}-${subnet_type}-subnet-${az}"
        
        # Check if subnet already exists
        local existing_subnet=$(aws ec2 describe-subnets \
            --filters "Name=tag:Name,Values=$subnet_name" \
            --query 'Subnets[0].SubnetId' \
            --output text 2>/dev/null || echo "None")
        
        if [[ "$existing_subnet" != "None" ]]; then
            log INFO "Subnet $subnet_name already exists: $existing_subnet"
            subnet_ids+=("$existing_subnet")
            continue
        fi
        
        # Create subnet
        local subnet_id=$(aws ec2 create-subnet \
            --vpc-id "$vpc_id" \
            --cidr-block "$cidr" \
            --availability-zone "$az" \
            --query 'Subnet.SubnetId' \
            --output text)
        
        # Add tags
        aws ec2 create-tags \
            --resources "$subnet_id" \
            --tags "Key=Name,Value=$subnet_name" \
                   "Key=Environment,Value=$ENVIRONMENT" \
                   "Key=Project,Value=$PROJECT_NAME" \
                   "Key=Type,Value=$subnet_type"
        
        # Enable auto-assign public IP for public subnets
        if [[ "$subnet_type" == "public" ]]; then
            aws ec2 modify-subnet-attribute \
                --subnet-id "$subnet_id" \
                --map-public-ip-on-launch
        fi
        
        subnet_ids+=("$subnet_id")
        log SUCCESS "Created $subnet_type subnet: $subnet_id ($cidr) in $az"
    done
    
    echo "${subnet_ids[@]}"
}

create_nat_gateways() {
    local -a public_subnet_ids=($1)
    
    log INFO "Creating NAT Gateways"
    
    local nat_gateway_ids=()
    
    for i in "${!public_subnet_ids[@]}"; do
        local subnet_id="${public_subnet_ids[$i]}"
        local az="${AVAILABILITY_ZONES[$i]}"
        local nat_name="${PROJECT_NAME}-${ENVIRONMENT}-nat-${az}"
        
        # Check if NAT Gateway already exists
        local existing_nat=$(aws ec2 describe-nat-gateways \
            --filter "Name=tag:Name,Values=$nat_name" "Name=state,Values=available" \
            --query 'NatGateways[0].NatGatewayId' \
            --output text 2>/dev/null || echo "None")
        
        if [[ "$existing_nat" != "None" ]]; then
            log INFO "NAT Gateway $nat_name already exists: $existing_nat"
            nat_gateway_ids+=("$existing_nat")
            continue
        fi
        
        # Allocate Elastic IP
        local eip_allocation_id=$(aws ec2 allocate-address \
            --domain vpc \
            --query 'AllocationId' \
            --output text)
        
        # Add tags to EIP
        aws ec2 create-tags \
            --resources "$eip_allocation_id" \
            --tags "Key=Name,Value=${nat_name}-eip" \
                   "Key=Environment,Value=$ENVIRONMENT" \
                   "Key=Project,Value=$PROJECT_NAME"
        
        # Create NAT Gateway
        local nat_id=$(aws ec2 create-nat-gateway \
            --subnet-id "$subnet_id" \
            --allocation-id "$eip_allocation_id" \
            --query 'NatGateway.NatGatewayId' \
            --output text)
        
        # Add tags to NAT Gateway
        aws ec2 create-tags \
            --resources "$nat_id" \
            --tags "Key=Name,Value=$nat_name" \
                   "Key=Environment,Value=$ENVIRONMENT" \
                   "Key=Project,Value=$PROJECT_NAME"
        
        nat_gateway_ids+=("$nat_id")
        log SUCCESS "Created NAT Gateway: $nat_id in $az"
    done
    
    # Wait for NAT Gateways to be available
    for nat_id in "${nat_gateway_ids[@]}"; do
        log INFO "Waiting for NAT Gateway $nat_id to be available..."
        aws ec2 wait nat-gateway-available --nat-gateway-ids "$nat_id"
    done
    
    log SUCCESS "All NAT Gateways are available"
    echo "${nat_gateway_ids[@]}"
}

create_route_tables() {
    local vpc_id="$1"
    local igw_id="$2"
    local -a public_subnet_ids=($3)
    local -a private_subnet_ids=($4)
    local -a database_subnet_ids=($5)
    local -a nat_gateway_ids=($6)
    
    log INFO "Creating route tables"
    
    # Create public route table
    local public_rt_name="${PROJECT_NAME}-${ENVIRONMENT}-public-rt"
    local public_rt_id=$(aws ec2 create-route-table \
        --vpc-id "$vpc_id" \
        --query 'RouteTable.RouteTableId' \
        --output text)
    
    aws ec2 create-tags \
        --resources "$public_rt_id" \
        --tags "Key=Name,Value=$public_rt_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME" \
               "Key=Type,Value=public"
    
    # Add route to Internet Gateway
    aws ec2 create-route \
        --route-table-id "$public_rt_id" \
        --destination-cidr-block "0.0.0.0/0" \
        --gateway-id "$igw_id"
    
    # Associate public subnets with public route table
    for subnet_id in "${public_subnet_ids[@]}"; do
        aws ec2 associate-route-table \
            --subnet-id "$subnet_id" \
            --route-table-id "$public_rt_id" >/dev/null
    done
    
    log SUCCESS "Created public route table: $public_rt_id"
    
    # Create private route tables (one per AZ for high availability)
    for i in "${!private_subnet_ids[@]}"; do
        local subnet_id="${private_subnet_ids[$i]}"
        local nat_id="${nat_gateway_ids[$i]}"
        local az="${AVAILABILITY_ZONES[$i]}"
        local private_rt_name="${PROJECT_NAME}-${ENVIRONMENT}-private-rt-${az}"
        
        local private_rt_id=$(aws ec2 create-route-table \
            --vpc-id "$vpc_id" \
            --query 'RouteTable.RouteTableId' \
            --output text)
        
        aws ec2 create-tags \
            --resources "$private_rt_id" \
            --tags "Key=Name,Value=$private_rt_name" \
                   "Key=Environment,Value=$ENVIRONMENT" \
                   "Key=Project,Value=$PROJECT_NAME" \
                   "Key=Type,Value=private"
        
        # Add route to NAT Gateway
        aws ec2 create-route \
            --route-table-id "$private_rt_id" \
            --destination-cidr-block "0.0.0.0/0" \
            --nat-gateway-id "$nat_id"
        
        # Associate private subnet with private route table
        aws ec2 associate-route-table \
            --subnet-id "$subnet_id" \
            --route-table-id "$private_rt_id" >/dev/null
        
        log SUCCESS "Created private route table: $private_rt_id for $az"
    done
    
    # Create database route table
    local db_rt_name="${PROJECT_NAME}-${ENVIRONMENT}-database-rt"
    local db_rt_id=$(aws ec2 create-route-table \
        --vpc-id "$vpc_id" \
        --query 'RouteTable.RouteTableId' \
        --output text)
    
    aws ec2 create-tags \
        --resources "$db_rt_id" \
        --tags "Key=Name,Value=$db_rt_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME" \
               "Key=Type,Value=database"
    
    # Associate database subnets with database route table
    for subnet_id in "${database_subnet_ids[@]}"; do
        aws ec2 associate-route-table \
            --subnet-id "$subnet_id" \
            --route-table-id "$db_rt_id" >/dev/null
    done
    
    log SUCCESS "Created database route table: $db_rt_id"
}

create_security_groups() {
    local vpc_id="$1"
    
    log INFO "Creating security groups"
    
    # Application Load Balancer Security Group
    local alb_sg_name="${PROJECT_NAME}-${ENVIRONMENT}-alb-sg"
    local alb_sg_id=$(aws ec2 create-security-group \
        --group-name "$alb_sg_name" \
        --description "Security group for ALB in ${PROJECT_NAME} ${ENVIRONMENT}" \
        --vpc-id "$vpc_id" \
        --query 'GroupId' \
        --output text)
    
    aws ec2 create-tags \
        --resources "$alb_sg_id" \
        --tags "Key=Name,Value=$alb_sg_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME"
    
    # ALB ingress rules
    aws ec2 authorize-security-group-ingress \
        --group-id "$alb_sg_id" \
        --protocol tcp --port 80 --cidr "0.0.0.0/0"
    aws ec2 authorize-security-group-ingress \
        --group-id "$alb_sg_id" \
        --protocol tcp --port 443 --cidr "0.0.0.0/0"
    
    log SUCCESS "Created ALB security group: $alb_sg_id"
    
    # Application Security Group
    local app_sg_name="${PROJECT_NAME}-${ENVIRONMENT}-app-sg"
    local app_sg_id=$(aws ec2 create-security-group \
        --group-name "$app_sg_name" \
        --description "Security group for application in ${PROJECT_NAME} ${ENVIRONMENT}" \
        --vpc-id "$vpc_id" \
        --query 'GroupId' \
        --output text)
    
    aws ec2 create-tags \
        --resources "$app_sg_id" \
        --tags "Key=Name,Value=$app_sg_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME"
    
    # App ingress rules
    aws ec2 authorize-security-group-ingress \
        --group-id "$app_sg_id" \
        --protocol tcp --port 3000 --source-group "$alb_sg_id"
    aws ec2 authorize-security-group-ingress \
        --group-id "$app_sg_id" \
        --protocol tcp --port 22 --cidr "$VPC_CIDR"
    
    log SUCCESS "Created application security group: $app_sg_id"
    
    # Database Security Group
    local db_sg_name="${PROJECT_NAME}-${ENVIRONMENT}-db-sg"
    local db_sg_id=$(aws ec2 create-security-group \
        --group-name "$db_sg_name" \
        --description "Security group for database in ${PROJECT_NAME} ${ENVIRONMENT}" \
        --vpc-id "$vpc_id" \
        --query 'GroupId' \
        --output text)
    
    aws ec2 create-tags \
        --resources "$db_sg_id" \
        --tags "Key=Name,Value=$db_sg_name" \
               "Key=Environment,Value=$ENVIRONMENT" \
               "Key=Project,Value=$PROJECT_NAME"
    
    # Database ingress rules
    aws ec2 authorize-security-group-ingress \
        --group-id "$db_sg_id" \
        --protocol tcp --port 5432 --source-group "$app_sg_id"  # PostgreSQL
    aws ec2 authorize-security-group-ingress \
        --group-id "$db_sg_id" \
        --protocol tcp --port 3306 --source-group "$app_sg_id"  # MySQL
    aws ec2 authorize-security-group-ingress \
        --group-id "$db_sg_id" \
        --protocol tcp --port 6379 --source-group "$app_sg_id"  # Redis
    
    log SUCCESS "Created database security group: $db_sg_id"
}

create_vpc_endpoints() {
    local vpc_id="$1"
    local -a private_subnet_ids=($2)
    
    log INFO "Creating VPC endpoints"
    
    # Get route table IDs for private subnets
    local route_table_ids=()
    for subnet_id in "${private_subnet_ids[@]}"; do
        local rt_id=$(aws ec2 describe-route-tables \
            --filters "Name=association.subnet-id,Values=$subnet_id" \
            --query 'RouteTables[0].RouteTableId' \
            --output text)
        route_table_ids+=("$rt_id")
    done
    
    # S3 Gateway Endpoint
    local s3_endpoint_name="${PROJECT_NAME}-${ENVIRONMENT}-s3-endpoint"
    aws ec2 create-vpc-endpoint \
        --vpc-id "$vpc_id" \
        --service-name "com.amazonaws.${AWS_REGION}.s3" \
        --vpc-endpoint-type Gateway \
        --route-table-ids "${route_table_ids[@]}" \
        --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=$s3_endpoint_name},{Key=Environment,Value=$ENVIRONMENT},{Key=Project,Value=$PROJECT_NAME}]" >/dev/null
    
    log SUCCESS "Created S3 VPC endpoint"
    
    # ECR API Interface Endpoint
    local ecr_api_endpoint_name="${PROJECT_NAME}-${ENVIRONMENT}-ecr-api-endpoint"
    aws ec2 create-vpc-endpoint \
        --vpc-id "$vpc_id" \
        --service-name "com.amazonaws.${AWS_REGION}.ecr.api" \
        --vpc-endpoint-type Interface \
        --subnet-ids "${private_subnet_ids[@]}" \
        --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=$ecr_api_endpoint_name},{Key=Environment,Value=$ENVIRONMENT},{Key=Project,Value=$PROJECT_NAME}]" >/dev/null
    
    log SUCCESS "Created ECR API VPC endpoint"
    
    # ECR DKR Interface Endpoint
    local ecr_dkr_endpoint_name="${PROJECT_NAME}-${ENVIRONMENT}-ecr-dkr-endpoint"
    aws ec2 create-vpc-endpoint \
        --vpc-id "$vpc_id" \
        --service-name "com.amazonaws.${AWS_REGION}.ecr.dkr" \
        --vpc-endpoint-type Interface \
        --subnet-ids "${private_subnet_ids[@]}" \
        --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=$ecr_dkr_endpoint_name},{Key=Environment,Value=$ENVIRONMENT},{Key=Project,Value=$PROJECT_NAME}]" >/dev/null
    
    log SUCCESS "Created ECR DKR VPC endpoint"
}

delete_vpc() {
    local vpc_id="$1"
    
    log WARN "Deleting VPC and all associated resources: $vpc_id"
    
    # This is a complex operation that would need to delete all resources
    # in the correct order. For now, we'll just log the warning.
    log WARN "VPC deletion not implemented. Please delete manually through AWS Console."
    log INFO "VPC ID to delete: $vpc_id"
}

generate_network_summary() {
    local vpc_id="$1"
    
    log INFO "Generating network summary"
    
    # Get VPC details
    local vpc_info=$(aws ec2 describe-vpcs --vpc-ids "$vpc_id" --query 'Vpcs[0]')
    local vpc_cidr=$(echo "$vpc_info" | jq -r '.CidrBlock')
    
    # Get subnets
    local subnets=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=$vpc_id" \
        --query 'Subnets[*].[SubnetId,CidrBlock,AvailabilityZone,Tags[?Key==`Name`].Value|[0],Tags[?Key==`Type`].Value|[0]]' \
        --output table)
    
    cat > "$PROJECT_ROOT/network-summary-$ENVIRONMENT.md" << EOF
# Network Infrastructure Summary

**Environment**: $ENVIRONMENT  
**VPC ID**: $vpc_id  
**VPC CIDR**: $vpc_cidr  
**Region**: $AWS_REGION  

## Availability Zones
${AVAILABILITY_ZONES[*]}

## Subnets

$subnets

## Security Groups

### ALB Security Group
- **Name**: ${PROJECT_NAME}-${ENVIRONMENT}-alb-sg
- **Ingress**: HTTP (80), HTTPS (443) from 0.0.0.0/0

### Application Security Group  
- **Name**: ${PROJECT_NAME}-${ENVIRONMENT}-app-sg
- **Ingress**: Port 3000 from ALB SG, SSH (22) from VPC CIDR

### Database Security Group
- **Name**: ${PROJECT_NAME}-${ENVIRONMENT}-db-sg  
- **Ingress**: PostgreSQL (5432), MySQL (3306), Redis (6379) from App SG

## Network Architecture

\`\`\`
Internet Gateway
    |
Public Subnets (ALB)
    |
NAT Gateways
    |
Private Subnets (Applications)
    |
Database Subnets (RDS, ElastiCache)
\`\`\`

## VPC Endpoints

- **S3 Gateway Endpoint**: For S3 access without internet routing
- **ECR Interface Endpoints**: For container image pulls
- **Other AWS Services**: As needed

## Next Steps

1. Deploy Application Load Balancer in public subnets
2. Deploy ECS/EKS cluster in private subnets  
3. Deploy RDS in database subnets
4. Configure DNS and SSL certificates
5. Set up monitoring and logging

---
Generated on: $(date)
EOF
    
    log SUCCESS "Network summary saved to: $PROJECT_ROOT/network-summary-$ENVIRONMENT.md"
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
    
    # Create VPC infrastructure
    local vpc_id=$(create_vpc)
    local igw_id=$(create_internet_gateway "$vpc_id")
    
    # Create subnets
    local public_subnet_ids=($(create_subnets "$vpc_id" "public" PUBLIC_SUBNET_CIDRS))
    local private_subnet_ids=($(create_subnets "$vpc_id" "private" PRIVATE_SUBNET_CIDRS))
    local database_subnet_ids=($(create_subnets "$vpc_id" "database" DATABASE_SUBNET_CIDRS))
    
    # Create NAT Gateways
    local nat_gateway_ids=($(create_nat_gateways "${public_subnet_ids[*]}"))
    
    # Create route tables
    create_route_tables "$vpc_id" "$igw_id" "${public_subnet_ids[*]}" "${private_subnet_ids[*]}" "${database_subnet_ids[*]}" "${nat_gateway_ids[*]}"
    
    # Create security groups
    create_security_groups "$vpc_id"
    
    # Create VPC endpoints
    create_vpc_endpoints "$vpc_id" "${private_subnet_ids[*]}"
    
    # Generate summary
    generate_network_summary "$vpc_id"
    
    log SUCCESS "VPC setup completed successfully!"
    echo
    log INFO "VPC ID: $vpc_id"
    log INFO "Public Subnets: ${public_subnet_ids[*]}"
    log INFO "Private Subnets: ${private_subnet_ids[*]}"
    log INFO "Database Subnets: ${database_subnet_ids[*]}"
    echo
    log INFO "Next steps:"
    log INFO "1. Run setup-rds.sh to create database"
    log INFO "2. Run setup-ecr.sh to create container repositories"  
    log INFO "3. Deploy your applications to the private subnets"
}

cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log SUCCESS "VPC setup completed successfully!"
    else
        log ERROR "VPC setup failed with exit code $exit_code"
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
        --cidr)
            VPC_CIDR="$2"
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
