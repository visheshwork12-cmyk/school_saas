#!/bin/bash
# scripts/deployment/deploy-static-assets.sh

set -e

# Configuration
PROJECT_NAME="school-erp-saas"
ENVIRONMENT=${1:-development}
AWS_REGION=${AWS_REGION:-us-east-1}

echo "🚀 Deploying static assets infrastructure for ${ENVIRONMENT}..."

# Create S3 buckets
echo "📦 Creating S3 bucket for static assets..."
terraform -chdir=infrastructure/terraform apply \
  -var="environment=${ENVIRONMENT}" \
  -var="project_name=${PROJECT_NAME}" \
  -target="aws_s3_bucket.static_assets" \
  -auto-approve

# Create CloudFront distribution
echo "🌐 Setting up CloudFront distribution..."
terraform -chdir=infrastructure/terraform apply \
  -var="environment=${ENVIRONMENT}" \
  -var="project_name=${PROJECT_NAME}" \
  -target="aws_cloudfront_distribution.static_assets" \
  -auto-approve

# Upload default assets
echo "📁 Uploading default static assets..."
aws s3 sync public/assets/ s3://${PROJECT_NAME}-static-assets-${ENVIRONMENT}/assets/ \
  --cache-control "public, max-age=31536000" \
  --content-encoding gzip

# Invalidate CloudFront cache
if [ "$ENVIRONMENT" = "production" ]; then
  echo "🔄 Invalidating CloudFront cache..."
  DISTRIBUTION_ID=$(terraform -chdir=infrastructure/terraform output -raw cloudfront_distribution_id)
  aws cloudfront create-invalidation \
    --distribution-id $DISTRIBUTION_ID \
    --paths "/*"
fi

echo "✅ Static assets infrastructure deployment completed!"
echo "📊 CloudFront Domain: $(terraform -chdir=infrastructure/terraform output -raw cloudfront_domain)"
echo "🪣 S3 Bucket: $(terraform -chdir=infrastructure/terraform output -raw static_assets_bucket)"
