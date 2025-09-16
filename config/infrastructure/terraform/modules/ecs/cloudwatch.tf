# config/infrastructure/terraform/modules/ecs/cloudwatch.tf
# CloudWatch Alarms for ECS Auto Scaling

# High CPU Utilization Alarm
resource "aws_cloudwatch_metric_alarm" "ecs_high_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.high_cpu_threshold
  alarm_description   = "This metric monitors ECS service CPU utilization"
  alarm_actions       = [aws_appautoscaling_policy.ecs_emergency_scale_out.arn]
  
  dimensions = {
    ServiceName = aws_ecs_service.school_erp_service.name
    ClusterName = var.cluster_name
  }
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-high-cpu-alarm"
    Environment = var.environment
    Component   = "monitoring"
  }
}

# Low CPU Utilization Alarm
resource "aws_cloudwatch_metric_alarm" "ecs_low_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-low-cpu"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.low_cpu_threshold
  alarm_description   = "This metric monitors ECS service low CPU utilization"
  alarm_actions       = [aws_appautoscaling_policy.ecs_scale_in.arn]
  
  dimensions = {
    ServiceName = aws_ecs_service.school_erp_service.name
    ClusterName = var.cluster_name
  }
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-low-cpu-alarm"
    Environment = var.environment
    Component   = "monitoring"
  }
}

# High Memory Utilization Alarm
resource "aws_cloudwatch_metric_alarm" "ecs_high_memory" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.high_memory_threshold
  alarm_description   = "This metric monitors ECS service memory utilization"
  
  dimensions = {
    ServiceName = aws_ecs_service.school_erp_service.name
    ClusterName = var.cluster_name
  }
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-high-memory-alarm"
    Environment = var.environment
    Component   = "monitoring"
  }
}

# Service Task Count Metric
resource "aws_cloudwatch_metric_alarm" "ecs_service_task_count" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-task-count"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "RunningTaskCount"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = var.min_healthy_tasks
  alarm_description   = "This metric monitors ECS service running task count"
  
  dimensions = {
    ServiceName = aws_ecs_service.school_erp_service.name
    ClusterName = var.cluster_name
  }
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-task-count-alarm"
    Environment = var.environment
    Component   = "monitoring"
  }
}

# Custom Application Metrics (Response Time)
resource "aws_cloudwatch_metric_alarm" "ecs_response_time" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = var.response_time_threshold
  alarm_description   = "This metric monitors ALB target response time"
  
  dimensions = {
    TargetGroup  = var.target_group_full_name
    LoadBalancer = var.alb_full_name
  }
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-response-time-alarm"
    Environment = var.environment
    Component   = "monitoring"
  }
}
