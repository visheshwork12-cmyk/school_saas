#!/bin/bash
# scripts/backup/s3-backup.sh
set -e

TIMESTAMP=$(date +%Y-%m-%d-%H-%M-%S)
BUCKET="school-erp-backups"
ENV=${ENVIRONMENT:-production}

echo "🚀 Starting S3 backup for $ENV..."

# Sync uploads directory to S3
aws s3 sync /app/uploads s3://$BUCKET/uploads/$ENV/$TIMESTAMP/ \
  --sse aws:kms \
  --region us-east-1

# Create versioned backup
aws s3api put-object --bucket $BUCKET --key backups/$ENV/$TIMESTAMP/config.tar.gz \
  --body config.tar.gz

echo "✅ S3 backup completed for $ENV"