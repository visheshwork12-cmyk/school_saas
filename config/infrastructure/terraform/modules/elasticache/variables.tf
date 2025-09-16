# infrastructure/terraform/modules/elasticache/variables.tf

# Basic Configuration
variable "name_prefix" {
  description = "Name prefix for all resources"
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

# Network Configuration
variable "subnet_ids" {
  description = "List of subnet IDs for ElastiCache subnet group"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "port" {
  description = "Redis port"
  type        = number
  default     = 6379
}

# Redis Configuration
variable "node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = null # Will use environment-specific default if not specified
}

variable "num_cache_clusters" {
  description = "Number of cache clusters (nodes) in the replication group"
  type        = number
  default     = null # Will use environment-specific default if not specified
}

# Alternative name for backward compatibility
variable "num_cache_nodes" {
  description = "Number of cache nodes (alias for num_cache_clusters)"
  type        = number
  default     = null
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

# Parameter Group Configuration
variable "create_parameter_group" {
  description = "Whether to create a custom parameter group"
  type        = bool
  default     = true
}

variable "parameter_group_name" {
  description = "Name of existing parameter group to use (if create_parameter_group is false)"
  type        = string
  default     = "default.redis7"
}

variable "parameter_group_family" {
  description = "ElastiCache parameter group family"
  type        = string
  default     = "redis7.x"
}

variable "parameter_group_parameters" {
  description = "List of additional parameters for the parameter group"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "maxmemory_policy" {
  description = "Redis maxmemory policy"
  type        = string
  default     = "allkeys-lru"
  validation {
    condition = contains([
      "noeviction", "allkeys-lru", "allkeys-lfu", "volatile-lru", 
      "volatile-lfu", "allkeys-random", "volatile-random", "volatile-ttl"
    ], var.maxmemory_policy)
    error_message = "Invalid maxmemory policy."
  }
}

variable "timeout" {
  description = "Redis timeout in seconds"
  type        = string
  default     = "300"
}

# High Availability Configuration
variable "automatic_failover_enabled" {
  description = "Enable automatic failover"
  type        = bool
  default     = null # Will use environment-specific default if not specified
}

variable "multi_az_enabled" {
  description = "Enable Multi-AZ"
  type        = bool
  default     = null # Will use environment-specific default if not specified
}

# Backup Configuration
variable "snapshot_retention_limit" {
  description = "Number of days to retain snapshots"
  type        = number
  default     = null # Will use environment-specific default if not specified
}

variable "snapshot_window" {
  description = "Daily time range for snapshots (UTC)"
  type        = string
  default     = "03:00-05:00"
}

variable "maintenance_window" {
  description = "Weekly time range for maintenance (UTC)"
  type        = string
  default     = "sun:05:00-sun:07:00"
}

variable "create_final_snapshot" {
  description = "Create a final snapshot when the cluster is deleted"
  type        = bool
  default     = true
}

# Security Configuration
variable "at_rest_encryption_enabled" {
  description = "Enable encryption at rest"
  type        = bool
  default     = true
}

variable "transit_encryption_enabled" {
  description = "Enable encryption in transit"
  type        = bool
  default     = true
}

variable "auth_token_enabled" {
  description = "Enable Redis authentication token"
  type        = bool
  default     = false
}

variable "auth_token" {
  description = "Redis authentication token"
  type        = string
  default     = null
  sensitive   = true
}

# Management Configuration
variable "apply_immediately" {
  description = "Apply changes immediately or during maintenance window"
  type        = bool
  default     = null # Will use environment-specific default if not specified
}

variable "auto_minor_version_upgrade" {
  description = "Enable automatic minor version upgrades"
  type        = bool
  default     = true
}

variable "data_tiering_enabled" {
  description = "Enable data tiering for supported node types"
  type        = bool
  default     = false
}

# Monitoring Configuration
variable "notification_topic_arn" {
  description = "SNS topic ARN for ElastiCache notifications"
  type        = string
  default     = null
}

variable "enable_cloudwatch_alarms" {
  description = "Enable CloudWatch alarms"
  type        = bool
  default     = true
}

variable "cpu_utilization_threshold" {
  description = "CPU utilization threshold for CloudWatch alarm"
  type        = number
  default     = 75
}

variable "memory_utilization_threshold" {
  description = "Memory utilization threshold for CloudWatch alarm"
  type        = number
  default     = 85
}

variable "connection_count_threshold" {
  description = "Connection count threshold for CloudWatch alarm"
  type        = number
  default     = 4000
}

variable "alarm_actions" {
  description = "List of ARNs to notify when alarm triggers"
  type        = list(string)
  default     = []
}

# Logging Configuration
variable "log_delivery_configuration" {
  description = "Log delivery configuration for Redis"
  type = list(object({
    destination      = string
    destination_type = string
    log_format       = string
    log_type         = string
  }))
  default = []
}

variable "enable_slow_log" {
  description = "Enable slow log CloudWatch log group"
  type        = bool
  default     = false
}

variable "log_retention_in_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

# DNS Configuration
variable "create_route53_record" {
  description = "Create Route53 record for Redis endpoint"
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
  default     = null
}

variable "domain_name" {
  description = "Domain name for Route53 record"
  type        = string
  default     = null
}

# Tags
variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
