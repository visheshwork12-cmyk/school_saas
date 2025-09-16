# infrastructure/terraform/modules/cloudwatch/dashboards.tf

# Main CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  count = var.enable_dashboard ? 1 : 0
  
  dashboard_name = "${local.name_prefix}-monitoring-dashboard"
  
  dashboard_body = jsonencode({
    widgets = concat([
      # ECS Cluster Overview
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", var.ecs_service_name, "ClusterName", var.ecs_cluster_name],
            ["AWS/ECS", "MemoryUtilization", "ServiceName", var.ecs_service_name, "ClusterName", var.ecs_cluster_name]
          ]
          view    = "timeSeries"
          stacked = false
          region  = local.region
          title   = "ECS Service Metrics"
          period  = 300
          stat    = "Average"
        }
      },
      
      # ALB Metrics
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", split("/", var.alb_arn)[1]],
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", split("/", var.alb_arn)[1]]
          ]
          view    = "timeSeries"
          stacked = false
          region  = local.region
          title   = "Application Load Balancer"
          period  = 300
          stat    = "Average"
        }
      },
      
      # Error Rate
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_2XX_Count", "LoadBalancer", split("/", var.alb_arn)[1]],
            ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", split("/", var.alb_arn)[1]],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", split("/", var.alb_arn)[1]]
          ]
          view    = "timeSeries"
          stacked = false
          region  = local.region
          title   = "HTTP Response Codes"
          period  = 300
          stat    = "Sum"
        }
      },
      
      # Custom Application Metrics
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["Application/${local.name_prefix}", "ErrorCount"],
            ["Application/${local.name_prefix}", "APIResponseTime"]
          ]
          view    = "timeSeries"
          stacked = false
          region  = local.region
          title   = "Application Metrics"
          period  = 300
          stat    = "Average"
        }
      }
    ],
    
    # Add RDS widgets if RDS is configured
    var.rds_instance_id != "" ? [
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.rds_instance_id],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.rds_instance_id]
          ]
          view    = "timeSeries"
          stacked = false
          region  = local.region
          title   = "RDS Database Metrics"
          period  = 300
          stat    = "Average"
        }
      }
    ] : [],
    
    # Add Redis widgets if Redis is configured
    var.redis_cluster_id != "" ? [
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", var.redis_cluster_id],
            ["AWS/ElastiCache", "DatabaseMemoryUsagePercentage", "CacheClusterId", var.redis_cluster_id]
          ]
          view    = "timeSeries"
          stacked = false
          region  = local.region
          title   = "ElastiCache Redis Metrics"
          period  = 300
          stat    = "Average"
        }
      }
    ] : [],
    
    # Log Insights Widget
    [{
      type   = "log"
      x      = 0
      y      = 18
      width  = 24
      height = 6
      
      properties = {
        query   = "SOURCE '${aws_cloudwatch_log_group.application.name}' | fields @timestamp, level, @message | filter level = \"ERROR\" | sort @timestamp desc | limit 20"
        region  = local.region
        title   = "Recent Error Logs"
      }
    }],
    
    # Custom dashboard widgets
    var.dashboard_widgets
    )
  })
}

# Business Metrics Dashboard
resource "aws_cloudwatch_dashboard" "business" {
  count = var.enable_dashboard ? 1 : 0
  
  dashboard_name = "${local.name_prefix}-business-metrics"
  
  dashboard_body = jsonencode({
    widgets = [
      # User Activity Metrics
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["Application/${local.name_prefix}", "ActiveUsers"],
            ["Application/${local.name_prefix}", "NewRegistrations"],
            ["Application/${local.name_prefix}", "LoginAttempts"]
          ]
          view    = "timeSeries"
          stacked = false
          region  = local.region
          title   = "User Activity"
          period  = 300
          stat    = "Sum"
        }
      },
      
      # API Usage
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["Application/${local.name_prefix}", "APICallsPerMinute"],
            ["Application/${local.name_prefix}", "UniqueAPIConsumers"]
          ]
          view    = "timeSeries"
          stacked = false
          region  = local.region
          title   = "API Usage Patterns"
          period  = 300
          stat    = "Average"
        }
      },
      
      # System Health Score
      {
        type   = "number"
        x      = 0
        y      = 6
        width  = 6
        height = 6
        
        properties = {
          metrics = [
            ["Application/${local.name_prefix}", "HealthScore"]
          ]
          view    = "singleValue"
          region  = local.region
          title   = "System Health Score"
          period  = 300
          stat    = "Average"
        }
      }
    ]
  })
}
