#!/bin/bash
# Terraform state recovery script

set -euo pipefail

ENVIRONMENT=${1:-production}
BACKUP_TIMESTAMP=${2:-latest}
BUCKET_PREFIX="school-erp-terraform-state"
REGION=${AWS_REGION:-us-east-1}

usage() {
    echo "Usage: $0 <environment> [backup_timestamp]"
    echo "Example: $0 production 2025-08-25-14-30-15"
    echo "Example: $0 production latest"
}

if [[ "$#" -lt 1 ]]; then
    usage
    exit 1
fi

BACKUP_BUCKET="${BUCKET_PREFIX}-backups-${REGION}"
STATE_BUCKET="${BUCKET_PREFIX}-${ENVIRONMENT}-${REGION}"

echo "🔄 Restoring Terraform state for $ENVIRONMENT..."

if [[ "$BACKUP_TIMESTAMP" == "latest" ]]; then
    # Get latest backup
    BACKUP_TIMESTAMP=$(aws s3api list-objects-v2 \
        --bucket "$BACKUP_BUCKET" \
        --prefix "backups/${ENVIRONMENT}/" \
        --query 'sort_by(Contents, &LastModified)[-1].Key' \
        --output text | cut -d'/' -f3)
    
    if [[ "$BACKUP_TIMESTAMP" == "None" ]]; then
        echo "❌ No backups found for environment: $ENVIRONMENT"
        exit 1
    fi
    
    echo "📅 Latest backup found: $BACKUP_TIMESTAMP"
fi

# Restore state file
echo "📥 Restoring state file..."
aws s3 cp "s3://$BACKUP_BUCKET/backups/${ENVIRONMENT}/${BACKUP_TIMESTAMP}/terraform.tfstate" \
    "s3://$STATE_BUCKET/${ENVIRONMENT}/terraform.tfstate" \
    --region "$REGION"

echo "✅ Terraform state restored successfully"
echo "🔍 Verify with: terraform plan"
