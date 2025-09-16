# infrastructure/terraform/modules/cloudwatch/logs.tf

# KMS Key for Log Encryption
resource "aws_kms_key" "logs" {
  count = var.enable_log_encryption ? 1 : 0
  
  description             = "KMS key for CloudWatch Logs encryption"
  deletion_window_in_days = 7
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${local.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow CloudWatch Logs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${local.region}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          ArnEquals = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${local.region}:${local.account_id}:log-group:${local.name_prefix}*"
          }
        }
      }
    ]
  })
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-logs-kms-key"
  })
}

resource "aws_kms_alias" "logs" {
  count = var.enable_log_encryption ? 1 : 0
  
  name          = "alias/${local.name_prefix}-logs"
  target_key_id = aws_kms_key.logs[0].key_id
}

# Application Log Group
resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/application/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.enable_log_encryption ? aws_kms_key.logs[0].arn : null
  
  tags = merge(local.common_tags, {
    Name        = "${local.name_prefix}-application-logs"
    LogType     = "application"
    Application = "school-erp"
  })
}

# ECS Log Group
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/aws/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.enable_log_encryption ? aws_kms_key.logs[0].arn : null
  
  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-ecs-logs"
    LogType  = "ecs"
    Service  = "containers"
  })
}

# API Gateway Log Group (if needed)
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.enable_log_encryption ? aws_kms_key.logs[0].arn : null
  
  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-api-gateway-logs"
    LogType  = "api-gateway"
    Service  = "api"
  })
}

# Lambda Log Group (for future use)
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.enable_log_encryption ? aws_kms_key.logs[0].arn : null
  
  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-lambda-logs"
    LogType  = "lambda"
    Service  = "serverless"
  })
}

# Custom Log Groups
resource "aws_cloudwatch_log_group" "custom" {
  for_each = { for lg in var.log_groups : lg.name => lg }
  
  name              = "/aws/custom/${local.name_prefix}-${each.value.name}"
  retention_in_days = each.value.retention_in_days
  kms_key_id        = each.value.kms_key_id != null ? each.value.kms_key_id : (var.enable_log_encryption ? aws_kms_key.logs[0].arn : null)
  
  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-${each.value.name}-logs"
    LogType  = "custom"
    Purpose  = each.value.name
  })
}

# Log Streams for Application Log Group
resource "aws_cloudwatch_log_stream" "application_streams" {
  for_each = toset([
    "api-server",
    "background-jobs",
    "audit-logs",
    "security-logs",
    "performance-logs"
  ])
  
  name           = each.value
  log_group_name = aws_cloudwatch_log_group.application.name
}

# Metric Filters for Error Detection
resource "aws_cloudwatch_log_metric_filter" "error_count" {
  name           = "${local.name_prefix}-error-count"
  log_group_name = aws_cloudwatch_log_group.application.name
  pattern        = "[timestamp, request_id, level=\"ERROR\", ...]"
  
  metric_transformation {
    name      = "ErrorCount"
    namespace = "Application/${local.name_prefix}"
    value     = "1"
    
    default_value = "0"
  }
}

# Metric Filter for API Response Time
resource "aws_cloudwatch_log_metric_filter" "api_response_time" {
  name           = "${local.name_prefix}-api-response-time"
  log_group_name = aws_cloudwatch_log_group.application.name
  pattern        = "[timestamp, request_id, level, method, path, status, response_time]"
  
  metric_transformation {
    name      = "APIResponseTime"
    namespace = "Application/${local.name_prefix}"
    value     = "$response_time"
    
    default_value = "0"
  }
}

# Metric Filter for Memory Usage
resource "aws_cloudwatch_log_metric_filter" "memory_usage" {
  name           = "${local.name_prefix}-memory-usage"
  log_group_name = aws_cloudwatch_log_group.application.name
  pattern        = "[timestamp, request_id, level, memory_used, memory_total]"
  
  metric_transformation {
    name      = "MemoryUsagePercent"
    namespace = "Application/${local.name_prefix}"
    value     = "($memory_used / $memory_total) * 100"
    
    default_value = "0"
  }
}

# Subscription Filter for Real-time Processing (optional)
resource "aws_cloudwatch_log_subscription_filter" "error_processing" {
  count = var.enable_log_processing ? 1 : 0
  
  name            = "${local.name_prefix}-error-processing"
  log_group_name  = aws_cloudwatch_log_group.application.name
  filter_pattern  = "[timestamp, request_id, level=\"ERROR\", ...]"
  destination_arn = var.log_processing_lambda_arn
}
