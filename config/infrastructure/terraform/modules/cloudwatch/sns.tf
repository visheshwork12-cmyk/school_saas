# infrastructure/terraform/modules/cloudwatch/sns.tf

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name         = "${local.name_prefix}-cloudwatch-alerts"
  display_name = "CloudWatch Alerts for ${local.name_prefix}"
  
  # Enable encryption
  kms_master_key_id = var.enable_sns_encryption ? aws_kms_key.sns[0].id : null
  
  # Delivery policy for better reliability
  delivery_policy = jsonencode({
    "http" = {
      "defaultHealthyRetryPolicy" = {
        "minDelayTarget"     = 20
        "maxDelayTarget"     = 20
        "numRetries"         = 3
        "numMaxDelayRetries" = 0
        "numMinDelayRetries" = 0
        "numNoDelayRetries"  = 0
        "backoffFunction"    = "linear"
      }
      "disableSubscriptionOverrides" = false
    }
  })
  
  tags = local.common_tags
}

# KMS Key for SNS encryption
resource "aws_kms_key" "sns" {
  count = var.enable_sns_encryption ? 1 : 0
  
  description             = "KMS key for SNS encryption"
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
        Sid    = "Allow CloudWatch Alarms"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-sns-kms-key"
  })
}

# Email Subscriptions
resource "aws_sns_topic_subscription" "email_alerts" {
  count = length(var.notification_endpoints)
  
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.notification_endpoints[count.index]
  
  # Add filter policy for critical alerts only
  filter_policy = jsonencode({
    "alarm_name" = [
      {"prefix": "${local.name_prefix}-ecs-cpu-critical"},
      {"prefix": "${local.name_prefix}-ecs-memory-critical"},
      {"prefix": "${local.name_prefix}-rds-cpu-critical"},
      {"prefix": "${local.name_prefix}-application-health"}
    ]
  })
}

# Slack Integration (if webhook provided)
resource "aws_sns_topic_subscription" "slack" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "https"
  endpoint  = var.slack_webhook_url
  
  # Delivery policy for Slack
  delivery_policy = jsonencode({
    "http" = {
      "defaultHealthyRetryPolicy" = {
        "minDelayTarget"     = 20
        "maxDelayTarget"     = 20
        "numRetries"         = 3
        "numMaxDelayRetries" = 0
        "numMinDelayRetries" = 0
        "numNoDelayRetries"  = 0
        "backoffFunction"    = "linear"
      }
    }
  })
}

# SNS Topic Policy
resource "aws_sns_topic_policy" "alerts" {
  arn = aws_sns_topic.alerts.arn
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudWatchAlarmsToPublish"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action = "SNS:Publish"
        Resource = aws_sns_topic.alerts.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      },
      {
        Sid    = "AllowEventBridgeToPublish"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action = "SNS:Publish"
        Resource = aws_sns_topic.alerts.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}

# Dead Letter Queue for failed notifications
resource "aws_sqs_queue" "dlq" {
  name                       = "${local.name_prefix}-cloudwatch-alerts-dlq"
  message_retention_seconds  = 1209600  # 14 days
  visibility_timeout_seconds = 300
  
  # Enable encryption
  kms_master_key_id = var.enable_sns_encryption ? aws_kms_key.sns[0].id : null
  
  tags = merge(local.common_tags, {
    Purpose = "DeadLetterQueue"
    Service = "SNS"
  })
}

# CloudWatch Alarm for DLQ messages
resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${local.name_prefix}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ApproximateNumberOfVisibleMessages"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Alert when messages appear in DLQ"
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
  
  tags = local.common_tags
}
