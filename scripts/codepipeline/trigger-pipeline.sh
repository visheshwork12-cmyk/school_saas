#!/bin/bash
# scripts/codepipeline/trigger-pipeline.sh

set -euo pipefail

PIPELINE_NAME=${1:-school-erp-staging-pipeline}
REASON=${2:-"Manual trigger"}

echo "🚀 Triggering CodePipeline: $PIPELINE_NAME"

# Start pipeline execution
EXECUTION_ID=$(aws codepipeline start-pipeline-execution \
  --name "$PIPELINE_NAME" \
  --query 'pipelineExecutionId' \
  --output text)

echo "✅ Pipeline triggered successfully!"
echo "Execution ID: $EXECUTION_ID"
echo ""
echo "Monitor progress:"
echo "aws codepipeline get-pipeline-execution --pipeline-name $PIPELINE_NAME --pipeline-execution-id $EXECUTION_ID"
echo ""
echo "AWS Console:"
echo "https://console.aws.amazon.com/codesuite/codepipeline/pipelines/$PIPELINE_NAME/view"
