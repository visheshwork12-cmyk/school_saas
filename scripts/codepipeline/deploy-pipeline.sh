# scripts/codepipeline/deploy-pipeline.sh
#!/bin/bash

set -euo pipefail

ENVIRONMENT=${1:-staging}
PROJECT_NAME="school-erp"

echo "🚀 Deploying CodePipeline infrastructure for $ENVIRONMENT..."

# Navigate to terraform directory
cd infrastructure/terraform

# Initialize and select workspace
terraform init
terraform workspace select $ENVIRONMENT || terraform workspace new $ENVIRONMENT

# Deploy the pipeline
terraform apply -var="environment=$ENVIRONMENT" -var="project_name=$PROJECT_NAME" -auto-approve

# Output important information
echo ""
echo "✅ CodePipeline deployment completed!"
echo ""
echo "📊 Pipeline Details:"
terraform output codepipeline_name
terraform output github_connection_arn
terraform output ecr_repository_url

echo ""
echo "🔗 Useful Links:"
echo "Pipeline: https://console.aws.amazon.com/codesuite/codepipeline/pipelines/$(terraform output -raw codepipeline_name)/view"
echo "CloudWatch: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=$(terraform output -raw codepipeline_name)-dashboard"

echo ""
echo "📋 Next Steps:"
echo "1. Complete GitHub connection setup in AWS Console"
echo "2. Test pipeline with a sample commit"
echo "3. Configure notification settings"
echo "4. Set up monitoring alerts"
