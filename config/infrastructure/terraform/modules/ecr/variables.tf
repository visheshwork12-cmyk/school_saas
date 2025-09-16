# infrastructure/terraform/modules/ecr/variables.tf
# Input variables for ECR module

variable "name_prefix" {
  description = "Name prefix for ECR repositories"
  type        = string
  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9-_]*$", var.name_prefix))
    error_message = "Name prefix must start with alphanumeric character and contain only alphanumeric characters, hyphens, and underscores."
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
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# Repository Configuration
variable "repositories" {
  description = "Map of additional repositories to create"
  type = map(object({
    description              = string
    image_tag_mutability    = string
    scan_on_push            = bool
    lifecycle_policy        = string
    cross_region_replication = bool
  }))
  default = {}

  validation {
    condition = alltrue([
      for repo in var.repositories : contains(["MUTABLE", "IMMUTABLE"], repo.image_tag_mutability)
    ])
    error_message = "Image tag mutability must be either MUTABLE or IMMUTABLE."
  }
}

# Access Control
variable "repository_read_access_arns" {
  description = "List of ARNs to allow pull access to repositories"
  type        = list(string)
  default     = []
}

variable "repository_read_write_access_arns" {
  description = "List of ARNs to allow push/pull access to repositories"
  type        = list(string)
  default     = null
}

# Encryption
variable "enable_encryption" {
  description = "Enable KMS encryption for repositories"
  type        = bool
  default     = true
}

variable "kms_deletion_window" {
  description = "KMS key deletion window in days"
  type        = number
  default     = 7
  validation {
    condition     = var.kms_deletion_window >= 7 && var.kms_deletion_window <= 30
    error_message = "KMS deletion window must be between 7 and 30 days."
  }
}

# Cross-Region Replication
variable "enable_cross_region_replication" {
  description = "Enable cross-region replication for ECR repositories"
  type        = bool
  default     = false
}

variable "replication_region" {
  description = "Region for cross-region replication"
  type        = string
  default     = "us-west-2"
}

# Image Scanning
variable "enhanced_scanning" {
  description = "Enable enhanced scanning (Inspector) for repositories"
  type        = bool
  default     = false
}

variable "scanning_rules" {
  description = "Enhanced scanning rules configuration"
  type = list(object({
    repository_filter = string
    filter_type      = string
    scan_frequency   = string
  }))
  default = [
    {
      repository_filter = "*"
      filter_type      = "WILDCARD"
      scan_frequency   = "SCAN_ON_PUSH"
    }
  ]
}

# Lifecycle Management
variable "prevent_destroy" {
  description = "Prevent accidental deletion of ECR repositories"
  type        = bool
  default     = true
}

# Monitoring
variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
  validation {
    condition = contains([
      1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653
    ], var.log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch retention period."
  }
}

# Registry Policy
variable "registry_policy" {
  description = "JSON policy document for ECR registry"
  type        = string
  default     = null
}

# Resource Limits
variable "max_repositories" {
  description = "Maximum number of repositories to create (safety limit)"
  type        = number
  default     = 50
  validation {
    condition     = var.max_repositories > 0 && var.max_repositories <= 1000
    error_message = "Max repositories must be between 1 and 1000."
  }
}

# Cost Optimization
variable "lifecycle_policy_preview" {
  description = "Enable lifecycle policy preview before applying"
  type        = bool
  default     = false
}

variable "image_scan_findings_retention_days" {
  description = "Number of days to retain image scan findings"
  type        = number
  default     = 30
  validation {
    condition     = var.image_scan_findings_retention_days >= 1 && var.image_scan_findings_retention_days <= 365
    error_message = "Image scan findings retention must be between 1 and 365 days."
  }
}
