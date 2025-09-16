#!/bin/bash
# scripts/deployment/validate-iam.sh

set -euo pipefail

ENVIRONMENT=${1:-staging}

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [IAM-VALIDATE] $*"
}

validate_role() {
    local role_name=$1
    local role_arn=$2
    
    log "Validating role: $role_name"
    
    # Check if role exists
    if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
        log "✅ Role $role_name exists"
        
        # Check attached policies
        local policies=$(aws iam list-attached-role-policies --role-name "$role_name" --query 'AttachedPolicies[].PolicyName' --output text)
        log "📋 Attached policies: $policies"
        
        return 0
    else
        log "❌ Role $role_name not found"
        return 1
    fi
}

log "🔍 Validating IAM configuration for $ENVIRONMENT"

# Get role names from terraform output
cd "$(dirname "${BASH_SOURCE[0]}")/../../config/infrastructure/terraform"

EKS_CLUSTER_ROLE=$(terraform output -raw eks_cluster_role_name)
EKS_NODE_ROLE=$(terraform output -raw eks_node_role_name)
APP_SERVICE_ROLE=$(terraform output -raw app_service_role_name)

# Validate each role
validate_role "$EKS_CLUSTER_ROLE" "$(terraform output -raw eks_cluster_role_arn)"
validate_role "$EKS_NODE_ROLE" "$(terraform output -raw eks_node_role_arn)"
validate_role "$APP_SERVICE_ROLE" "$(terraform output -raw app_service_role_arn)"

# Validate Kubernetes RBAC
log "🔍 Validating Kubernetes RBAC..."
if kubectl get serviceaccount school-erp-service-account -n school-erp >/dev/null 2>&1; then
    log "✅ Service account exists"
else
    log "❌ Service account not found"
    exit 1
fi

if kubectl get clusterrole school-erp-cluster-role >/dev/null 2>&1; then
    log "✅ Cluster role exists"
else
    log "❌ Cluster role not found"
    exit 1
fi

log "✅ IAM validation completed successfully!"
