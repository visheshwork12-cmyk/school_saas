#!/bin/bash
set -e

echo "🚀 Verifying Phase 3 documentation..."

# Define expected files
DOCS_DIR="docs/deployment"
EXPECTED_FILES=("docker.md" "kubernetes.md" "aws-deployment.md" "monitoring.md" "backup-restore.md")

# Check if directory exists
if [ ! -d "$DOCS_DIR" ]; then
  echo "❌ Documentation directory $DOCS_DIR not found"
  exit 1
fi

# Verify each file
for file in "${EXPECTED_FILES[@]}"; do
  if [ ! -f "$DOCS_DIR/$file" ]; then
    echo "❌ File $DOCS_DIR/$file not found"
    exit 1
  else
    echo "✅ File $DOCS_DIR/$file exists"
    if [ $(wc -l < "$DOCS_DIR/$file") -lt 10 ]; then
      echo "⚠️ File $DOCS_DIR/$file may be incomplete (less than 10 lines)"
    fi
  fi
done

echo "🎉 Phase 3 documentation verification completed successfully!"