# infrastructure/terraform/modules/cloudwatch/main.tf
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Local values
locals {
  common_tags = merge(var.tags, {
    Module = "cloudwatch"
    Environment = var.environment
    ManagedBy = "terraform"
  })
  
  name_prefix = "${var.name_prefix}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  region = data.aws_region.current.name
}

# CloudWatch Composite Alarm for Application Health
resource "aws_cloudwatch_composite_alarm" "application_health" {
  count = var.enable_composite_alarms ? 1 : 0
  
  alarm_name        = "${local.name_prefix}-application-health"
  alarm_description = "Composite alarm for overall application health"
  
  alarm_rule = join(" OR ", [
    aws_cloudwatch_metric_alarm.ecs_cpu_high.alarm_name,
    aws_cloudwatch_metric_alarm.ecs_memory_high.alarm_name,
    aws_cloudwatch_metric_alarm.alb_response_time_high.alarm_name,
    aws_cloudwatch_metric_alarm.rds_cpu_high.alarm_name
  ])
  
  actions_enabled = true
  alarm_actions   = [aws_sns_topic.alerts.arn]
  ok_actions      = [aws_sns_topic.alerts.arn]
  
  tags = local.common_tags
}

# CloudWatch Event Rules for ECS Task State Changes
resource "aws_cloudwatch_event_rule" "ecs_task_state_change" {
  count = var.enable_event_rules ? 1 : 0
  
  name        = "${local.name_prefix}-ecs-task-state-change"
  description = "Capture ECS task state changes"
  
  event_pattern = jsonencode({
    source      = ["aws.ecs"]
    detail-type = ["ECS Task State Change"]
    detail = {
      clusterArn = [var.ecs_cluster_arn]
    }
  })
  
  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "ecs_task_state_sns" {
  count = var.enable_event_rules ? 1 : 0
  
  rule      = aws_cloudwatch_event_rule.ecs_task_state_change[0].name
  target_id = "SendToSNS"
  arn       = aws_sns_topic.alerts.arn
}

# CloudWatch Insights Queries
resource "aws_cloudwatch_query_definition" "error_analysis" {
  count = var.enable_insights_queries ? 1 : 0
  
  name = "${local.name_prefix}-error-analysis"
  
  log_group_names = [
    aws_cloudwatch_log_group.application.name
  ]
  
  query_string = <<EOF
fields @timestamp, @message, level, error
| filter level = "error"
| stats count() by bin(5m)
| sort @timestamp desc
EOF
}

resource "aws_cloudwatch_query_definition" "performance_analysis" {
  count = var.enable_insights_queries ? 1 : 0
  
  name = "${local.name_prefix}-performance-analysis"
  
  log_group_names = [
    aws_cloudwatch_log_group.application.name
  ]
  
  query_string = <<EOF
fields @timestamp, @message, responseTime, method, path
| filter ispresent(responseTime)
| stats avg(responseTime), max(responseTime), min(responseTime) by bin(5m)
| sort @timestamp desc
EOF
}
