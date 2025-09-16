# infrastructure/terraform/modules/cloudwatch/outputs.tf

# SNS Topic
output "sns_topic_arn" {
  description = "ARN of the SNS topic for alerts"
  value       = aws_sns_topic.alerts.arn
}

output "sns_topic_name" {
  description = "Name of the SNS topic for alerts"
  value       = aws_sns_topic.alerts.name
}

# Log Groups
output "log_group_names" {
  description = "Names of created CloudWatch log groups"
  value = merge(
    { for lg in aws_cloudwatch_log_group.custom : lg.name => lg.name },
    {
      application = aws_cloudwatch_log_group.application.name
      ecs         = aws_cloudwatch_log_group.ecs.name
    }
  )
}

output "log_group_arns" {
  description = "ARNs of created CloudWatch log groups"
  value = merge(
    { for lg in aws_cloudwatch_log_group.custom : lg.name => lg.arn },
    {
      application = aws_cloudwatch_log_group.application.arn
      ecs         = aws_cloudwatch_log_group.ecs.arn
    }
  )
}

# Alarms
output "alarm_names" {
  description = "Names of created CloudWatch alarms"
  value = {
    ecs_cpu_high              = aws_cloudwatch_metric_alarm.ecs_cpu_high.alarm_name
    ecs_memory_high           = aws_cloudwatch_metric_alarm.ecs_memory_high.alarm_name
    alb_response_time_high    = aws_cloudwatch_metric_alarm.alb_response_time_high.alarm_name
    alb_target_response_time  = aws_cloudwatch_metric_alarm.alb_target_response_time.alarm_name
    rds_cpu_high             = var.rds_instance_id != "" ? aws_cloudwatch_metric_alarm.rds_cpu_high[0].alarm_name : null
    redis_cpu_high           = var.redis_cluster_id != "" ? aws_cloudwatch_metric_alarm.redis_cpu_high[0].alarm_name : null
  }
}

output "alarm_arns" {
  description = "ARNs of created CloudWatch alarms"
  value = {
    ecs_cpu_high              = aws_cloudwatch_metric_alarm.ecs_cpu_high.arn
    ecs_memory_high           = aws_cloudwatch_metric_alarm.ecs_memory_high.arn
    alb_response_time_high    = aws_cloudwatch_metric_alarm.alb_response_time_high.arn
    alb_target_response_time  = aws_cloudwatch_metric_alarm.alb_target_response_time.arn
    rds_cpu_high             = var.rds_instance_id != "" ? aws_cloudwatch_metric_alarm.rds_cpu_high[0].arn : null
    redis_cpu_high           = var.redis_cluster_id != "" ? aws_cloudwatch_metric_alarm.redis_cpu_high[0].arn : null
  }
}

# Dashboard
output "dashboard_url" {
  description = "URL of the CloudWatch dashboard"
  value       = var.enable_dashboard ? "<https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${aws_cloudwatch_dashboard.main>[0].dashboard_name}" : null
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = var.enable_dashboard ? aws_cloudwatch_dashboard.main[0].dashboard_name : null
}

# CloudWatch Insights
output "insights_query_names" {
  description = "Names of CloudWatch Insights saved queries"
  value = var.enable_insights_queries ? {
    error_analysis       = aws_cloudwatch_query_definition.error_analysis[0].name
    performance_analysis = aws_cloudwatch_query_definition.performance_analysis[0].name
  } : {}
}

# Event Rules
output "event_rule_names" {
  description = "Names of CloudWatch event rules"
  value = var.enable_event_rules ? {
    ecs_task_state_change = aws_cloudwatch_event_rule.ecs_task_state_change[0].name
  } : {}
}

# Composite Alarms
output "composite_alarm_names" {
  description = "Names of composite alarms"
  value = var.enable_composite_alarms ? {
    application_health = aws_cloudwatch_composite_alarm.application_health[0].alarm_name
  } : {}
}

# Monitoring Configuration Summary
output "monitoring_summary" {
  description = "Summary of monitoring configuration"
  value = {
    environment          = var.environment
    detailed_monitoring  = var.enable_detailed_monitoring
    composite_alarms     = var.enable_composite_alarms
    event_rules         = var.enable_event_rules
    insights_queries    = var.enable_insights_queries
    dashboard_enabled   = var.enable_dashboard
    log_retention_days  = var.log_retention_days
    notification_count  = length(var.notification_endpoints)
  }
}
