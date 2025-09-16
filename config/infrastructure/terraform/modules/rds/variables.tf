# infrastructure/terraform/modules/rds/variables.tf

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

# Database Engine Configuration
variable "engine" {
  description = "Database engine"
  type        = string
  default     = "postgres"
  validation {
    condition = contains([
      "postgres", "mysql", "mariadb", "oracle-ee", "oracle-se2", 
      "oracle-se1", "oracle-se", "sqlserver-ee", "sqlserver-se", 
      "sqlserver-ex", "sqlserver-web"
    ], var.engine)
    error_message = "Engine must be a valid RDS engine type."
  }
}

variable "engine_version" {
  description = "Database engine version"
  type        = string
  default     = "15.4"
}

variable "major_engine_version" {
  description = "Major engine version for option group"
  type        = string
  default     = "15"
}

variable "parameter_group_family" {
  description = "Database parameter group family"
  type        = string
  default     = "postgres15"
}

# Instance Configuration
variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = null # Will use environment-based defaults
}

variable "database_name" {
  description = "Name of the database to create"
  type        = string
  default     = "schoolerp"
}

variable "username" {
  description = "Master username for the database"
  type        = string
  default     = "admin"
}

variable "password" {
  description = "Master password for the database (if null, random password will be generated)"
  type        = string
  default     = null
  sensitive   = true
}

variable "port" {
  description = "Database port"
  type        = number
  default     = 5432
}

# Storage Configuration
variable "allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
  default     = null # Will use environment-based defaults
}

variable "max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling"
  type        = number
  default     = null # Will use environment-based defaults
}

variable "storage_type" {
  description = "Storage type"
  type        = string
  default     = "gp3"
  validation {
    condition     = contains(["gp2", "gp3", "io1", "io2"], var.storage_type)
    error_message = "Storage type must be gp2, gp3, io1, or io2."
  }
}

variable "storage_encrypted" {
  description = "Enable storage encryption"
  type        = bool
  default     = true
}

variable "kms_key_id" {
  description = "KMS key ID for encryption (if not creating new key)"
  type        = string
  default     = null
}

variable "create_kms_key" {
  description = "Create a new KMS key for encryption"
  type        = bool
  default     = true
}

variable "kms_key_deletion_window" {
  description = "KMS key deletion window in days"
  type        = number
  default     = 7
}

# Network Configuration
variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "vpc_security_group_ids" {
  description = "List of VPC security group IDs"
  type        = list(string)
}

variable "publicly_accessible" {
  description = "Make the RDS instance publicly accessible"
  type        = bool
  default     = false
}

# Backup Configuration
variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = null # Will use environment-based defaults
  validation {
    condition     = var.backup_retention_period == null || (var.backup_retention_period >= 0 && var.backup_retention_period <= 35)
    error_message = "Backup retention period must be between 0 and 35 days."
  }
}

variable "backup_window" {
  description = "Backup window (UTC)"
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Maintenance window (UTC)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot when destroying"
  type        = bool
  default     = false
}

# High Availability
variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = null # Will use environment-based defaults
}

# Monitoring Configuration
variable "monitoring_interval" {
  description = "Enhanced monitoring interval (0, 1, 5, 10, 15, 30, 60 seconds)"
  type        = number
  default     = 60
  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "Monitoring interval must be 0, 1, 5, 10, 15, 30, or 60 seconds."
  }
}

variable "monitoring_role_arn" {
  description = "IAM role ARN for enhanced monitoring"
  type        = string
  default     = null
}

variable "performance_insights_enabled" {
  description = "Enable Performance Insights"
  type        = bool
  default     = null # Will use environment-based defaults
}

variable "performance_insights_kms_key_id" {
  description = "KMS key ID for Performance Insights encryption"
  type        = string
  default     = null
}

variable "enabled_cloudwatch_logs_exports" {
  description = "List of log types to export to CloudWatch"
  type        = list(string)
  default     = ["postgresql"] # Default for PostgreSQL
}

variable "cloudwatch_logs_retention_days" {
  description = "CloudWatch logs retention period"
  type        = number
  default     = 30
}

# Security Configuration
variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = null # Will use environment-based defaults
}

variable "auto_minor_version_upgrade" {
  description = "Enable automatic minor version upgrades"
  type        = bool
  default     = true
}

# Read Replica Configuration
variable "create_read_replica" {
  description = "Create read replica instances"
  type        = bool
  default     = false
}

variable "read_replica_count" {
  description = "Number of read replicas to create"
  type        = number
  default     = 1
}

variable "read_replica_instance_class" {
  description = "Instance class for read replicas"
  type        = string
  default     = null # Will use same as primary
}

# Parameter and Option Groups
variable "db_parameters" {
  description = "Database parameters"
  type = list(object({
    name  = string
    value = string
  }))
  default = [
    {
      name  = "shared_preload_libraries"
      value = "pg_stat_statements"
    },
    {
      name  = "log_statement"
      value = "all"
    }
  ]
}

variable "create_option_group" {
  description = "Create DB option group"
  type        = bool
  default     = false
}

variable "db_options" {
  description = "Database options"
  type = list(object({
    option_name = string
    option_settings = list(object({
      name  = string
      value = string
    }))
  }))
  default = []
}

# SSM Configuration
variable "store_credentials_in_ssm" {
  description = "Store database credentials in SSM Parameter Store"
  type        = bool
  default     = true
}

# Tags
variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
