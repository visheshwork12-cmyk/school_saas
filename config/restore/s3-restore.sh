#!/bin/bash
# scripts/restore/s3-restore.sh
set -e

BUCKET="school-erp-backups"
ENV=${ENVIRONMENT:-production}
RESTORE_POINT=${1:-latest}

echo "🚀 Starting S3 restore for $ENV..."

# List available backups
BACKUP=$(aws s3 ls s3://$BUCKET/uploads/$ENV/ --recursive | sort | tail -n 1 | awk '{print $4}')
if [ -z "$BACKUP" ]; then
  echo "❌ No backups found"
  exit 1
fi

# Restore uploads
aws s3 sync s3://$BUCKET/uploads/$ENV/$BACKUP/ /app/uploads \
  --region us-east-1

echo "✅ S3 restore completed for $ENV from $BACKUP"