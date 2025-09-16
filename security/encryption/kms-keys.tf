# KMS Key Management for School ERP SaaS
# Provides comprehensive encryption key management for all AWS resources

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data sources for account and region info
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_iam_policy_document" "kms_key_policy" {
  statement {
    sid    = "EnableRootAccess"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "EnableServiceAccess"
    effect = "Allow"
    principals {
      type = "Service"
      identifiers = [
        "rds.amazonaws.com",
        "s3.amazonaws.com",
        "secretsmanager.amazonaws.com",
        "logs.amazonaws.com",
        "backup.amazonaws.com"
      ]
    }
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey"
    ]
    resources = ["*"]
  }
}

# Local values for consistent tagging and naming
locals {
  common_tags = merge(var.tags, {
    Module      = "kms-encryption"
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "school-erp-saas"
  })
  
  name_prefix = "${var.project_name}-${var.environment}"
}

# Primary KMS Key for Application Data
resource "aws_kms_key" "school_erp_primary" {
  description              = "Primary KMS key for School ERP SaaS application encryption"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  policy                   = data.aws_iam_policy_document.kms_key_policy.json
  
  # Security configurations
  enable_key_rotation     = true
  deletion_window_in_days = var.key_deletion_window
  
  # Multi-region key for disaster recovery
  multi_region = var.enable_multi_region_keys
  
  tags = merge(local.common_tags, {
    Name        = "${local.name_prefix}-primary-key"
    KeyType     = "primary"
    DataClass   = "sensitive"
    Compliance  = "gdpr-compliant"
  })
}

resource "aws_kms_alias" "school_erp_primary" {
  name          = "alias/${local.name_prefix}-primary"
  target_key_id = aws_kms_key.school_erp_primary.key_id
}

# Database Encryption Key
resource "aws_kms_key" "database" {
  description              = "KMS key for School ERP database encryption (RDS, DocumentDB)"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  policy                   = data.aws_iam_policy_document.kms_key_policy.json
  
  enable_key_rotation     = true
  deletion_window_in_days = var.key_deletion_window
  multi_region           = var.enable_multi_region_keys
  
  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-database-key"
    KeyType   = "database"
    DataClass = "pii"
    Usage     = "rds-encryption"
  })
}

resource "aws_kms_alias" "database" {
  name          = "alias/${local.name_prefix}-database"
  target_key_id = aws_kms_key.database.key_id
}

# S3 Storage Encryption Key  
resource "aws_kms_key" "s3_storage" {
  description              = "KMS key for School ERP S3 bucket encryption"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  policy                   = data.aws_iam_policy_document.kms_key_policy.json
  
  enable_key_rotation     = true
  deletion_window_in_days = var.key_deletion_window
  multi_region           = var.enable_multi_region_keys
  
  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-s3-key"
    KeyType   = "storage"
    DataClass = "files"
    Usage     = "s3-encryption"
  })
}

resource "aws_kms_alias" "s3_storage" {
  name          = "alias/${local.name_prefix}-s3-storage"
  target_key_id = aws_kms_key.s3_storage.key_id
}

# Secrets Manager Encryption Key
resource "aws_kms_key" "secrets_manager" {
  description              = "KMS key for AWS Secrets Manager encryption"
  key_usage                = "ENCRYPT_DECRYPT"  
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  policy                   = data.aws_iam_policy_document.kms_key_policy.json
  
  enable_key_rotation     = true
  deletion_window_in_days = var.key_deletion_window
  multi_region           = var.enable_multi_region_keys
  
  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-secrets-key"
    KeyType   = "secrets"
    DataClass = "credentials"
    Usage     = "secrets-manager"
  })
}

resource "aws_kms_alias" "secrets_manager" {
  name          = "alias/${local.name_prefix}-secrets"
  target_key_id = aws_kms_key.secrets_manager.key_id
}

# CloudWatch Logs Encryption Key
resource "aws_kms_key" "cloudwatch_logs" {
  description              = "KMS key for CloudWatch Logs encryption"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  policy                   = data.aws_iam_policy_document.kms_key_policy.json
  
  enable_key_rotation     = true
  deletion_window_in_days = var.key_deletion_window
  multi_region           = var.enable_multi_region_keys
  
  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-logs-key"
    KeyType   = "logging"
    DataClass = "operational"
    Usage     = "cloudwatch-logs"
  })
}

resource "aws_kms_alias" "cloudwatch_logs" {
  name          = "alias/${local.name_prefix}-logs"
  target_key_id = aws_kms_key.cloudwatch_logs.key_id
}

# Backup Encryption Key
resource "aws_kms_key" "backup" {
  count = var.enable_backup_encryption ? 1 : 0
  
  description              = "KMS key for AWS Backup encryption"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  policy                   = data.aws_iam_policy_document.kms_key_policy.json
  
  enable_key_rotation     = true
  deletion_window_in_days = var.key_deletion_window
  multi_region           = var.enable_multi_region_keys
  
  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-backup-key"
    KeyType   = "backup"
    DataClass = "backup"
    Usage     = "aws-backup"
  })
}

resource "aws_kms_alias" "backup" {
  count = var.enable_backup_encryption ? 1 : 0
  
  name          = "alias/${local.name_prefix}-backup"
  target_key_id = aws_kms_key.backup.key_id
}

# EKS Encryption Key (for Kubernetes secrets)
resource "aws_kms_key" "eks_secrets" {
  count = var.enable_eks_encryption ? 1 : 0
  
  description              = "KMS key for EKS secrets encryption"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  policy                   = data.aws_iam_policy_document.kms_key_policy.json
  
  enable_key_rotation     = true
  deletion_window_in_days = var.key_deletion_window
  multi_region           = var.enable_multi_region_keys
  
  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-eks-key"
    KeyType   = "kubernetes"
    DataClass = "secrets"
    Usage     = "eks-encryption"
  })
}

resource "aws_kms_alias" "eks_secrets" {
  count = var.enable_eks_encryption ? 1 : 0
  
  name          = "alias/${local.name_prefix}-eks-secrets"
  target_key_id = aws_kms_key.eks_secrets.key_id
}

# Cross-region replica keys for disaster recovery
resource "aws_kms_key" "replica_primary" {
  count = var.enable_cross_region_replication ? 1 : 0
  
  provider                 = aws.replica_region
  description              = "Replica KMS key for School ERP in secondary region"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  policy                   = data.aws_iam_policy_document.kms_key_policy.json
  
  enable_key_rotation     = true
  deletion_window_in_days = var.key_deletion_window
  
  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-replica-primary-key"
    KeyType   = "replica"
    DataClass = "disaster-recovery"
    Region    = var.replica_region
  })
}

resource "aws_kms_alias" "replica_primary" {
  count = var.enable_cross_region_replication ? 1 : 0
  
  provider      = aws.replica_region
  name          = "alias/${local.name_prefix}-replica-primary"
  target_key_id = aws_kms_key.replica_primary.key_id
}

# KMS Key Grants for Cross-Service Access
resource "aws_kms_grant" "rds_grant" {
  name              = "rds-encryption-grant"
  key_id            = aws_kms_key.database.key_id
  grantee_principal = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-rds-role"
  
  operations = [
    "Decrypt",
    "GenerateDataKey",
    "ReEncryptFrom",
    "ReEncryptTo",
    "DescribeKey"
  ]
  
  constraints {
    encryption_context_equals = {
      "aws:rds:db-instance-id" = "${local.name_prefix}-*"
    }
  }
}

resource "aws_kms_grant" "s3_grant" {
  name              = "s3-encryption-grant"
  key_id            = aws_kms_key.s3_storage.key_id
  grantee_principal = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-s3-role"
  
  operations = [
    "Decrypt",
    "GenerateDataKey",
    "ReEncryptFrom", 
    "ReEncryptTo",
    "DescribeKey"
  ]
}

# Variables
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "school-erp-saas"
}

variable "environment" {
  description = "Environment name"
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

variable "key_deletion_window" {
  description = "KMS key deletion window in days"
  type        = number
  default     = 30
  validation {
    condition     = var.key_deletion_window >= 7 && var.key_deletion_window <= 30
    error_message = "Key deletion window must be between 7 and 30 days."
  }
}

variable "enable_multi_region_keys" {
  description = "Enable multi-region KMS keys"
  type        = bool
  default     = true
}

variable "enable_backup_encryption" {
  description = "Create KMS key for backup encryption"
  type        = bool
  default     = true
}

variable "enable_eks_encryption" {
  description = "Create KMS key for EKS secrets encryption"
  type        = bool
  default     = true
}

variable "enable_cross_region_replication" {
  description = "Enable cross-region key replication"
  type        = bool
  default     = false
}

variable "replica_region" {
  description = "AWS region for key replication"
  type        = string
  default     = "us-west-2"
}

# Outputs
output "primary_key_id" {
  description = "ID of the primary KMS key"
  value       = aws_kms_key.school_erp_primary.key_id
}

output "primary_key_arn" {
  description = "ARN of the primary KMS key"
  value       = aws_kms_key.school_erp_primary.arn
}

output "database_key_id" {
  description = "ID of the database KMS key"
  value       = aws_kms_key.database.key_id
}

output "database_key_arn" {
  description = "ARN of the database KMS key"
  value       = aws_kms_key.database.arn
}

output "s3_key_id" {
  description = "ID of the S3 KMS key"
  value       = aws_kms_key.s3_storage.key_id
}

output "s3_key_arn" {
  description = "ARN of the S3 KMS key"
  value       = aws_kms_key.s3_storage.arn
}

output "secrets_key_id" {
  description = "ID of the Secrets Manager KMS key"
  value       = aws_kms_key.secrets_manager.key_id
}

output "secrets_key_arn" {
  description = "ARN of the Secrets Manager KMS key"
  value       = aws_kms_key.secrets_manager.arn
}

output "logs_key_id" {
  description = "ID of the CloudWatch Logs KMS key"
  value       = aws_kms_key.cloudwatch_logs.key_id
}

output "logs_key_arn" {
  description = "ARN of the CloudWatch Logs KMS key"
  value       = aws_kms_key.cloudwatch_logs.arn
}

output "backup_key_id" {
  description = "ID of the backup KMS key"
  value       = var.enable_backup_encryption ? aws_kms_key.backup.key_id : null
}

output "eks_key_id" {
  description = "ID of the EKS secrets KMS key"
  value       = var.enable_eks_encryption ? aws_kms_key.eks_secrets.key_id : null
}

output "all_key_ids" {
  description = "Map of all KMS key IDs"
  value = {
    primary         = aws_kms_key.school_erp_primary.key_id
    database        = aws_kms_key.database.key_id
    s3_storage      = aws_kms_key.s3_storage.key_id
    secrets_manager = aws_kms_key.secrets_manager.key_id
    cloudwatch_logs = aws_kms_key.cloudwatch_logs.key_id
    backup          = var.enable_backup_encryption ? aws_kms_key.backup.key_id : null
    eks_secrets     = var.enable_eks_encryption ? aws_kms_key.eks_secrets.key_id : null
  }
}

output "key_aliases" {
  description = "Map of KMS key aliases"
  value = {
    primary         = aws_kms_alias.school_erp_primary.name
    database        = aws_kms_alias.database.name
    s3_storage      = aws_kms_alias.s3_storage.name
    secrets_manager = aws_kms_alias.secrets_manager.name
    cloudwatch_logs = aws_kms_alias.cloudwatch_logs.name
    backup          = var.enable_backup_encryption ? aws_kms_alias.backup.name : null
    eks_secrets     = var.enable_eks_encryption ? aws_kms_alias.eks_secrets.name : null
  }
}
