# config/infrastructure/terraform/modules/secrets/variables.tf

# Basic Configuration
variable "name_prefix" {
  description = "Name prefix for all secrets"
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

# KMS Configuration
variable "kms_key_id" {
  description = "KMS key ID for encrypting secrets"
  type        = string
  default     = null
}

# Database Secrets Configuration
variable "database_secrets" {
  description = "Map of database secrets to create"
  type = map(object({
    description           = optional(string)
    username              = string
    password              = optional(string)
    use_generated_password = optional(bool, true)
    host                  = string
    port                  = optional(number)
    database_name         = string
    engine                = optional(string, "postgres")
    application           = optional(string)
    recovery_window       = optional(number)
    enable_rotation       = optional(bool, false)
    rotation_lambda_arn   = optional(string)
    rotation_interval     = optional(number, 30)
    length                = optional(number, 32)
    special               = optional(bool, true)
    tags                  = optional(map(string), {})
  }))
  default = {}
}

# API Secrets Configuration
variable "api_secrets" {
  description = "Map of API secrets to create"
  type = map(object({
    description         = optional(string)
    api_key             = optional(string)
    use_generated_token = optional(bool, true)
    additional_fields   = optional(map(string), {})
    application         = optional(string)
    recovery_window     = optional(number)
    length              = optional(number, 64)
    tags                = optional(map(string), {})
  }))
  default = {}
}

# Service Secrets Configuration
variable "service_secrets" {
  description = "Map of third-party service secrets to create"
  type = map(object({
    description     = optional(string)
    secret_data     = map(string)
    recovery_window = optional(number)
    tags            = optional(map(string), {})
  }))
  default = {}
}

# Replication Configuration
variable "replica_regions" {
  description = "List of regions for cross-region replication"
  type = list(object({
    region     = string
    kms_key_id = optional(string)
  }))
  default = []
}

# IAM Configuration
variable "create_access_policy" {
  description = "Create IAM policy for accessing secrets"
  type        = bool
  default     = true
}

# Logging Configuration
variable "enable_rotation_logs" {
  description = "Enable CloudWatch logs for secret rotation"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 30
}

# Tags
variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
