#!/bin/bash
# scripts/deployment/deploy-iam.sh

set -euo pipefail

ENVIRONMENT=${1:-staging}
REGION=${AWS_REGION:-us-east-1}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [IAM-DEPLOY] $*"
}

log "🚀 Deploying IAM configuration for $ENVIRONMENT"

# 1. Navigate to terraform directory
cd "${SCRIPT_DIR}/../../config/infrastructure/terraform"

# 2. Initialize Terraform
log "Initializing Terraform..."
terraform init

# 3. Plan IAM changes
log "Planning IAM changes..."
terraform plan \
    -var="environment=$ENVIRONMENT" \
    -var="region=$REGION" \
    -target=module.iam \
    -out=iam-plan.out

# 4. Apply IAM changes
log "Applying IAM changes..."
terraform apply -auto-approve iam-plan.out

# 5. Get outputs
log "Getting IAM role ARNs..."
EKS_CLUSTER_ROLE_ARN=$(terraform output -raw eks_cluster_role_arn)
EKS_NODE_ROLE_ARN=$(terraform output -raw eks_node_role_arn)
APP_SERVICE_ROLE_ARN=$(terraform output -raw app_service_role_arn)

# 6. Update Kubernetes RBAC
log "Updating Kubernetes RBAC configuration..."
cd "${SCRIPT_DIR}/../../k8s"

# Replace placeholder with actual account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed -i.bak "s/\${AWS_ACCOUNT_ID}/$AWS_ACCOUNT_ID/g" rbac.yaml

# Apply RBAC configuration
kubectl apply -f rbac.yaml

log "✅ IAM deployment completed successfully!"
log "📋 Summary:"
log "   EKS Cluster Role: $EKS_CLUSTER_ROLE_ARN"
log "   EKS Node Role: $EKS_NODE_ROLE_ARN"
log "   App Service Role: $APP_SERVICE_ROLE_ARN"
