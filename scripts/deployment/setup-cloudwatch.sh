#!/bin/bash
# scripts/deployment/setup-cloudwatch.sh

set -e

ENVIRONMENT=${1:-development}
PROJECT_NAME="school-erp"

echo "Setting up CloudWatch for $ENVIRONMENT environment..."

# Create CloudWatch Log Groups
aws logs create-log-group --log-group-name "/aws/$PROJECT_NAME/$ENVIRONMENT/application" --region $AWS_REGION || true
aws logs create-log-group --log-group-name "/aws/$PROJECT_NAME/$ENVIRONMENT/errors" --region $AWS_REGION || true

# Set retention policy
aws logs put-retention-policy --log-group-name "/aws/$PROJECT_NAME/$ENVIRONMENT/application" --retention-in-days 30 --region $AWS_REGION
aws logs put-retention-policy --log-group-name "/aws/$PROJECT_NAME/$ENVIRONMENT/errors" --retention-in-days 90 --region $AWS_REGION

# Apply CloudWatch alarms via Terraform
cd infrastructure/terraform
terraform apply -target=aws_cloudwatch_metric_alarm -var="environment=$ENVIRONMENT" -auto-approve

echo "CloudWatch setup completed for $ENVIRONMENT!"
