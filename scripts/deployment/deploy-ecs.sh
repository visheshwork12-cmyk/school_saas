#!/bin/bash
# scripts/deployment/deploy-ecs.sh
# Enhanced ECS Deployment & Monitoring Script

set -euo pipefail

# Script metadata
SCRIPT_NAME="deploy-ecs.sh"
SCRIPT_VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT=${1:-production}
ACTION=${2:-deploy}
REGION=${AWS_REGION:-us-east-1}

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} ${message}" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} ${message}" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${message}" ;;
        DEBUG) [[ "${DEBUG:-}" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} ${message}" ;;
    esac
}

deploy_infrastructure() {
    log INFO "🚀 Deploying ECS infrastructure for ${ENVIRONMENT}..."
    
    cd "${PROJECT_ROOT}/config/infrastructure/terraform"
    
    # Initialize Terraform
    log INFO "Initializing Terraform..."
    terraform init
    
    # Plan the deployment
    log INFO "Planning deployment..."
    terraform plan -var-file="environments/${ENVIRONMENT}.tfvars" -out="ecs-${ENVIRONMENT}.tfplan"
    
    # Apply the configuration
    log INFO "Applying configuration..."
    terraform apply "ecs-${ENVIRONMENT}.tfplan"
    
    log INFO "✅ ECS infrastructure deployed successfully"
}

monitor_scaling() {
    log INFO "📊 Monitoring ECS scaling activities..."
    
    local cluster_name="school-erp-saas-${ENVIRONMENT}-cluster"
    local service_name="school-erp-saas-${ENVIRONMENT}-service"
    
    aws application-autoscaling describe-scaling-activities \
      --service-namespace ecs \
      --resource-id "service/${cluster_name}/${service_name}" \
      --region "${REGION}" \
      --max-items 10
}

test_scaling() {
    log INFO "🧪 Testing scaling policies..."
    
    # Simulate high CPU usage
    aws cloudwatch put-metric-data \
      --namespace "AWS/ECS" \
      --metric-data MetricName=CPUUtilization,Value=90.0,Unit=Percent \
      --region "${REGION}"
    
    log INFO "High CPU metric sent. Monitoring for scaling response..."
    
    # Wait and check for scaling activity
    sleep 60
    monitor_scaling
}

get_service_status() {
    log INFO "📋 Getting ECS service status..."
    
    local cluster_name="school-erp-saas-${ENVIRONMENT}-cluster"
    local service_name="school-erp-saas-${ENVIRONMENT}-service"
    
    aws ecs describe-services \
      --cluster "${cluster_name}" \
      --services "${service_name}" \
      --region "${REGION}" \
      --query 'services[0].{ServiceName:serviceName,Status:status,RunningCount:runningCount,PendingCount:pendingCount,DesiredCount:desiredCount}' \
      --output table
}

main() {
    case $ACTION in
        deploy)
            deploy_infrastructure
            ;;
        monitor)
            monitor_scaling
            ;;
        test)
            test_scaling
            ;;
        status)
            get_service_status
            ;;
        *)
            echo "Usage: $0 <environment> <deploy|monitor|test|status>"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"
