# infrastructure/terraform/modules/cloudwatch/variables.tf

# Basic Configuration
variable "name_prefix" {
  description = "Name prefix for resources"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}

# Monitoring Configuration
variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring"
  type        = bool
  default     = true
}

variable "enable_composite_alarms" {
  description = "Enable CloudWatch composite alarms"
  type        = bool
  default     = true
}

variable "enable_event_rules" {
  description = "Enable CloudWatch event rules"
  type        = bool
  default     = true
}

variable "enable_insights_queries" {
  description = "Enable CloudWatch Insights saved queries"
  type        = bool
  default     = true
}

variable "enable_dashboard" {
  description = "Enable CloudWatch dashboard creation"
  type        = bool
  default     = true
}

# Resource ARNs and IDs
variable "vpc_id" {
  description = "VPC ID for monitoring"
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS cluster name to monitor"
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ECS cluster ARN to monitor"
  type        = string
}

variable "ecs_service_name" {
  description = "ECS service name to monitor"
  type        = string
}

variable "rds_instance_id" {
  description = "RDS instance ID to monitor"
  type        = string
  default     = ""
}

variable "redis_cluster_id" {
  description = "ElastiCache Redis cluster ID to monitor"
  type        = string
  default     = ""
}

variable "alb_arn" {
  description = "Application Load Balancer ARN to monitor"
  type        = string
  default     = ""
}

variable "alb_target_group_arn" {
  description = "ALB target group ARN to monitor"
  type        = string
  default     = ""
}

# Alarm Thresholds
variable "cpu_threshold_high" {
  description = "High CPU utilization threshold percentage"
  type        = number
  default     = 80
}

variable "cpu_threshold_critical" {
  description = "Critical CPU utilization threshold percentage"
  type        = number
  default     = 90
}

variable "memory_threshold_high" {
  description = "High memory utilization threshold percentage"
  type        = number
  default     = 80
}

variable "memory_threshold_critical" {
  description = "Critical memory utilization threshold percentage"
  type        = number
  default     = 90
}

variable "response_time_threshold" {
  description = "Response time threshold in seconds"
  type        = number
  default     = 2.0
}

variable "error_rate_threshold" {
  description = "Error rate threshold percentage"
  type        = number
  default     = 5.0
}

variable "disk_space_threshold" {
  description = "Disk space utilization threshold percentage"
  type        = number
  default     = 85
}

# Notification Configuration
variable "notification_endpoints" {
  description = "List of email addresses for notifications"
  type        = list(string)
  default     = []
}

variable "sns_topic_arn" {
  description = "Existing SNS topic ARN for notifications (optional)"
  type        = string
  default     = ""
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

# Log Configuration
variable "log_retention_days" {
  description = "CloudWatch logs retention period in days"
  type        = number
  default     = 14
}

variable "enable_log_encryption" {
  description = "Enable CloudWatch logs encryption"
  type        = bool
  default     = true
}

variable "log_groups" {
  description = "List of log groups to create"
  type = list(object({
    name              = string
    retention_in_days = number
    kms_key_id        = optional(string)
  }))
  default = []
}

# Custom Metrics
variable "custom_metrics" {
  description = "List of custom metrics to monitor"
  type = list(object({
    name        = string
    namespace   = string
    metric_name = string
    threshold   = number
    comparison  = string
    statistic   = string
  }))
  default = []
}

# Dashboard Configuration
variable "dashboard_widgets" {
  description = "Additional dashboard widgets configuration"
  type = list(object({
    type   = string
    x      = number
    y      = number
    width  = number
    height = number
    properties = map(any)
  }))
  default = []
}
