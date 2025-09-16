#!/bin/bash
# scripts/deployment/deploy-cloudfront.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT=${1:-staging}
AWS_REGION=${2:-us-east-1}
DOMAIN_NAME=${3:-}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be development, staging, or production"
fi

log "🚀 Starting CloudFront deployment for $ENVIRONMENT environment"

# Check AWS credentials
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    error "AWS credentials not configured or invalid"
fi

log "✅ AWS credentials verified"

# Navigate to terraform directory
cd "$PROJECT_ROOT/infrastructure/terraform"

# Initialize Terraform
log "🔧 Initializing Terraform..."
terraform init \
    -backend-config="key=school-erp/cloudfront/${ENVIRONMENT}/terraform.tfstate" \
    -backend-config="region=${AWS_REGION}"

# Plan deployment
log "📋 Planning CloudFront deployment..."
terraform plan \
    -var="environment=${ENVIRONMENT}" \
    -var="aws_region=${AWS_REGION}" \
    ${DOMAIN_NAME:+-var="domain_name=${DOMAIN_NAME}"} \
    -target=aws_cloudfront_distribution.school_erp_cdn \
    -target=aws_cloudfront_origin_access_control.school_erp_oac \
    -target=aws_wafv2_web_acl.school_erp_waf \
    -out="cloudfront-${ENVIRONMENT}.tfplan"

# Apply deployment
read -p "Do you want to apply the CloudFront changes? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "🚀 Applying CloudFront deployment..."
    terraform apply "cloudfront-${ENVIRONMENT}.tfplan"
    
    # Get CloudFront distribution ID
    DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id)
    log "✅ CloudFront distribution created: $DISTRIBUTION_ID"
    
    # Update S3 bucket policy with distribution ARN
    log "🔧 Updating S3 bucket policy..."
    aws s3api put-bucket-policy \
        --bucket "school-erp-static-assets-${ENVIRONMENT}" \
        --policy file://<(envsubst < "$PROJECT_ROOT/config/s3-bucket-policy-template.json")
    
    # Deploy CloudFront functions
    log "⚡ Deploying CloudFront functions..."
    
    # Security headers function
    aws cloudfront create-function \
        --name "school-erp-security-headers-${ENVIRONMENT}" \
        --function-config "Comment=Security headers for School ERP,Runtime=cloudfront-js-1.0" \
        --function-code "fileb://$PROJECT_ROOT/infrastructure/cloudfront-functions/security-headers.js" \
        --region us-east-1 || true
    
    # Origin selection function
    aws cloudfront create-function \
        --name "school-erp-origin-selection-${ENVIRONMENT}" \
        --function-config "Comment=Origin selection for School ERP,Runtime=cloudfront-js-1.0" \
        --function-code "fileb://$PROJECT_ROOT/infrastructure/cloudfront-functions/origin-selection.js" \
        --region us-east-1 || true
    
    log "✅ CloudFront functions deployed"
    
    # Wait for distribution deployment
    log "⏳ Waiting for CloudFront distribution deployment..."
    aws cloudfront wait distribution-deployed --id "$DISTRIBUTION_ID"
    
    log "✅ CloudFront distribution deployed successfully"
    
    # Create invalidation for immediate testing
    log "🔄 Creating CloudFront invalidation..."
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)
    
    log "✅ Invalidation created: $INVALIDATION_ID"
    
    # Output important information
    DOMAIN_NAME=$(terraform output -raw cloudfront_domain_name)
    
    log "🎉 CloudFront deployment completed successfully!"
    echo
    echo "=== Deployment Summary ==="
    echo "Environment: $ENVIRONMENT"
    echo "Distribution ID: $DISTRIBUTION_ID"
    echo "Domain Name: $DOMAIN_NAME"
    echo "Invalidation ID: $INVALIDATION_ID"
    echo
    echo "=== Next Steps ==="
    echo "1. Update DNS records to point to: $DOMAIN_NAME"
    echo "2. Test the CDN endpoints"
    echo "3. Monitor CloudWatch metrics"
    echo
else
    log "❌ CloudFront deployment cancelled"
    exit 0
fi

# Test CloudFront endpoints
log "🧪 Testing CloudFront endpoints..."

# Test static assets
if curl -f -s "https://${DOMAIN_NAME}/static/css/main.css" > /dev/null; then
    log "✅ Static assets endpoint working"
else
    warn "⚠️ Static assets endpoint not responding"
fi

# Test API endpoint
if curl -f -s "https://${DOMAIN_NAME}/api/v1/health" > /dev/null; then
    log "✅ API endpoint working"
else
    warn "⚠️ API endpoint not responding"
fi

# Test API docs
if curl -f -s "https://${DOMAIN_NAME}/api-docs" > /dev/null; then
    log "✅ API docs endpoint working"
else
    warn "⚠️ API docs endpoint not responding"
fi

log "🎉 CloudFront deployment and testing completed!"
