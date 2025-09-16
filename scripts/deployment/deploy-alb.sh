#!/bin/bash
# scripts/deployment/deploy-alb.sh

set -euo pipefail

ENVIRONMENT=${1:-development}
REGION=${AWS_REGION:-us-east-1}

echo "🚀 Deploying ALB for $ENVIRONMENT environment..."

# Navigate to terraform directory
cd config/infrastructure/terraform

# Initialize Terraform
terraform init

# Plan deployment
terraform plan \
  -var="environment=$ENVIRONMENT" \
  -var="region=$REGION" \
  -out=alb-deployment.tfplan

# Apply deployment
terraform apply alb-deployment.tfplan

# Get ALB DNS name
ALB_DNS=$(terraform output -raw alb_dns_name)
echo "✅ ALB deployed successfully!"
echo "🌐 ALB DNS: $ALB_DNS"

# Test health endpoints
echo "🏥 Testing health endpoints..."
sleep 30  # Wait for targets to become healthy

curl -f "http://$ALB_DNS/health" && echo "✅ Health endpoint working"
curl -f "http://$ALB_DNS/status" && echo "✅ Status endpoint working"

echo "🎉 ALB setup complete!"
