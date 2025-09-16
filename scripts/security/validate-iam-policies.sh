#!/bin/bash
# Validate IAM policies syntax
set -euo pipefail

POLICY_DIR="security/policies/iam"
POLICIES=(
  "rds-access-policy.json"
  "eks-cluster-policy.json"
  "backup-policy.json"
  "secrets-manager-policy.json"
  "ecr-access-policy.json"
)

echo "Validating IAM policies..."

for policy in "${POLICIES[@]}"; do
  echo "Validating $policy..."
  if aws iam validate-policy-document --policy-document "file://${POLICY_DIR}/${policy}" >/dev/null; then
    echo "✅ $policy is valid"
  else
    echo "❌ $policy has syntax errors"
    exit 1
  fi
done

echo "All IAM policies validated successfully!"
