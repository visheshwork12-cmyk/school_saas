# infrastructure/terraform/modules/backup/variables.tf

# ================================
# BASIC CONFIGURATION
# ================================

variable "name_prefix" {
  description = "Name prefix for all backup resources"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.name_prefix))
    error_message = "Name prefix must contain only lowercase letters, numbers, and hyphens."
  }
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
  description = "Additional tags to apply to all backup resources"
  type        = map(string)
  default     = {}
}

# ================================
# BACKUP CONFIGURATION
# ================================

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 30
  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 2555
    error_message = "Backup retention days must be between 7 and 2555."
  }
}

variable "enable_cross_region_backup" {
  description = "Enable cross-region backup replication"
  type        = bool
  default     = false
}

variable "cross_region_backup_region" {
  description = "AWS region for cross-region backup replication"
  type        = string
  default     = "us-west-2"
}

variable "backup_window_start_hour" {
  description = "Hour to start backup window (0-23)"
  type        = number
  default     = 2
  validation {
    condition     = var.backup_window_start_hour >= 0 && var.backup_window_start_hour <= 23
    error_message = "Backup window start hour must be between 0 and 23."
  }
}

# ================================
# KMS CONFIGURATION
# ================================

variable "kms_deletion_window" {
  description = "KMS key deletion window in days"
  type        = number
  default     = 10
  validation {
    condition     = var.kms_deletion_window >= 7 && var.kms_deletion_window <= 30
    error_message = "KMS deletion window must be between 7 and 30 days."
  }
}

# ================================
# RESOURCE ARNS FOR BACKUP
# ================================

variable "rds_instance_arns" {
  description = "List of RDS instance ARNs to backup"
  type        = list(string)
  default     = []
}

variable "efs_file_system_arns" {
  description = "List of EFS file system ARNs to backup"
  type        = list(string)
  default     = []
}

variable "ebs_volume_arns" {
  description = "List of EBS volume ARNs to backup"
  type        = list(string)
  default     = []
}

variable "dynamodb_table_arns" {
  description = "List of DynamoDB table ARNs to backup"
  type        = list(string)
  default     = []
}

# ================================
# APPLICATION-SPECIFIC BACKUPS
# ================================

variable "enable_mongodb_backup" {
  description = "Enable MongoDB backup using Lambda function"
  type        = bool
  default     = true
}

variable "mongodb_uri" {
  description = "MongoDB connection URI for backup"
  type        = string
  default     = ""
  sensitive   = true
}

variable "mongodb_backup_schedule" {
  description = "Cron expression for MongoDB backup schedule"
  type        = string
  default     = "cron(0 3 * * ? *)" # 3 AM daily
}

# ================================
# MONITORING & NOTIFICATIONS
# ================================

variable "enable_backup_notifications" {
  description = "Enable SNS notifications for backup events"
  type        = bool
  default     = true
}

variable "notification_email_addresses" {
  description = "List of email addresses for backup notifications"
  type        = list(string)
  default     = []
}

variable "enable_backup_monitoring" {
  description = "Enable CloudWatch monitoring for backup jobs"
  type        = bool
  default     = true
}

# ================================
# ADVANCED CONFIGURATION
# ================================

variable "backup_vault_lock_configuration" {
  description = "Backup vault lock configuration for compliance"
  type = object({
    changeable_for_days = optional(number, 3)
    max_retention_days  = optional(number, 1200)
    min_retention_days  = optional(number, 1)
  })
  default = null
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for supported resources"
  type        = bool
  default     = true
}

variable "backup_selection_conditions" {
  description = "Conditions for automatic backup selection"
  type = object({
    string_equals = optional(list(object({
      key   = string
      value = string
    })), [])
    string_not_equals = optional(list(object({
      key   = string
      value = string
    })), [])
  })
  default = {
    string_equals = [
      {
        key   = "Environment"
        value = "production"
      }
    ]
  }
}

# ================================
# LIFECYCLE POLICIES
# ================================

variable "lifecycle_cold_storage_after_days" {
  description = "Number of days before transitioning to cold storage"
  type        = number
  default     = 30
  validation {
    condition     = var.lifecycle_cold_storage_after_days >= 1
    error_message = "Cold storage transition must be at least 1 day."
  }
}

variable "lifecycle_delete_after_days" {
  description = "Number of days before deleting backups"
  type        = number
  default     = null
}

# ================================
# SECURITY CONFIGURATION
# ================================

variable "backup_vault_access_policy" {
  description = "Custom access policy for backup vault"
  type        = string
  default     = null
}

variable "enable_backup_audit_logging" {
  description = "Enable audit logging for backup operations"
  type        = bool
  default     = true
}

variable "allowed_backup_principals" {
  description = "List of AWS principals allowed to perform backup operations"
  type        = list(string)
  default     = []
}

# ================================
# COST OPTIMIZATION
# ================================

variable "enable_backup_cost_optimization" {
  description = "Enable cost optimization features"
  type        = bool
  default     = true
}

variable "backup_cost_allocation_tags" {
  description = "Tags for backup cost allocation"
  type        = map(string)
  default     = {}
}

# ================================
# DISASTER RECOVERY
# ================================

variable "disaster_recovery_tier" {
  description = "Disaster recovery tier (basic, standard, premium)"
  type        = string
  default     = "standard"
  validation {
    condition     = contains(["basic", "standard", "premium"], var.disaster_recovery_tier)
    error_message = "Disaster recovery tier must be basic, standard, or premium."
  }
}

variable "recovery_time_objective_hours" {
  description = "Recovery time objective in hours"
  type        = number
  default     = 4
  validation {
    condition     = var.recovery_time_objective_hours >= 1 && var.recovery_time_objective_hours <= 168
    error_message = "Recovery time objective must be between 1 and 168 hours."
  }
}

variable "recovery_point_objective_hours" {
  description = "Recovery point objective in hours"
  type        = number
  default     = 1
  validation {
    condition     = var.recovery_point_objective_hours >= 1 && var.recovery_point_objective_hours <= 24
    error_message = "Recovery point objective must be between 1 and 24 hours."
  }
}
