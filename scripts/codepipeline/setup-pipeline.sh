#!/bin/bash
# scripts/codepipeline/setup-pipeline.sh

set -euo pipefail

ENVIRONMENT=${1:-staging}
PROJECT_NAME="school-erp"
REGION=${AWS_REGION:-us-east-1}

echo "🚀 Setting up CodePipeline for $ENVIRONMENT environment..."

# Deploy pipeline infrastructure
cd infrastructure/terraform
terraform init
terraform workspace select $ENVIRONMENT || terraform workspace new $ENVIRONMENT

# Plan and apply pipeline resources
terraform plan \
  -var="environment=$ENVIRONMENT" \
  -var="project_name=$PROJECT_NAME" \
  -var="aws_region=$REGION" \
  -target=module.codepipeline \
  -out=pipeline.tfplan

terraform apply pipeline.tfplan

# Get pipeline outputs
PIPELINE_NAME=$(terraform output -raw codepipeline_name)
GITHUB_CONNECTION_ARN=$(terraform output -raw github_connection_arn)

echo "✅ CodePipeline setup completed!"
echo "Pipeline Name: $PIPELINE_NAME"
echo "GitHub Connection: $GITHUB_CONNECTION_ARN"
echo ""
echo "Next steps:"
echo "1. Complete GitHub connection setup in AWS Console"
echo "2. Trigger initial pipeline run"
echo "3. Configure branch protection rules"
