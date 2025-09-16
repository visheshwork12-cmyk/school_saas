# infrastructure/terraform/modules/backup/main.tf
# Comprehensive Backup Module for School ERP SaaS

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

# Local values for resource naming and tagging
locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  
  common_tags = merge(var.tags, {
    Module      = "backup"
    Component   = "data-protection"
    ManagedBy   = "terraform"
    Environment = var.environment
  })

  backup_schedule_expressions = {
    daily   = "cron(0 2 * * ? *)"     # 2 AM daily
    weekly  = "cron(0 3 ? * SUN *)"   # 3 AM every Sunday
    monthly = "cron(0 4 1 * ? *)"     # 4 AM on 1st of month
  }
}

# ================================
# S3 BACKUP STORAGE
# ================================

# Primary backup bucket
resource "aws_s3_bucket" "primary_backup" {
  bucket = "${var.name_prefix}-backups-${var.environment}-${local.region}"
  
  tags = merge(local.common_tags, {
    Name        = "${var.name_prefix}-primary-backups"
    BackupType  = "primary"
    Purpose     = "automated-backups"
  })
}

# Backup bucket versioning
resource "aws_s3_bucket_versioning" "primary_backup" {
  bucket = aws_s3_bucket.primary_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Backup bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "primary_backup" {
  bucket = aws_s3_bucket.primary_backup.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.backup_key.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Backup bucket lifecycle policy
resource "aws_s3_bucket_lifecycle_configuration" "primary_backup" {
  depends_on = [aws_s3_bucket_versioning.primary_backup]
  bucket     = aws_s3_bucket.primary_backup.id

  rule {
    id     = "backup-lifecycle"
    status = "Enabled"

    # Transition to IA after 30 days
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    # Transition to Glacier after 90 days
    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    # Transition to Deep Archive after 365 days
    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }

    # Delete after retention period
    expiration {
      days = var.backup_retention_days
    }

    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    # Version management
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.backup_retention_days
    }
  }
}

# Cross-region replication bucket (if enabled)
resource "aws_s3_bucket" "cross_region_backup" {
  count    = var.enable_cross_region_backup ? 1 : 0
  provider = aws.backup_region
  
  bucket = "${var.name_prefix}-backups-${var.environment}-${var.cross_region_backup_region}"
  
  tags = merge(local.common_tags, {
    Name       = "${var.name_prefix}-cross-region-backups"
    BackupType = "cross-region"
    Purpose    = "disaster-recovery"
  })
}

# Cross-region bucket versioning
resource "aws_s3_bucket_versioning" "cross_region_backup" {
  count    = var.enable_cross_region_backup ? 1 : 0
  provider = aws.backup_region
  bucket   = aws_s3_bucket.cross_region_backup[0].id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# Cross-region bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "cross_region_backup" {
  count    = var.enable_cross_region_backup ? 1 : 0
  provider = aws.backup_region
  bucket   = aws_s3_bucket.cross_region_backup[0].id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.backup_key_cross_region[0].arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# ================================
# KMS ENCRYPTION KEYS
# ================================

# Primary backup KMS key
resource "aws_kms_key" "backup_key" {
  description             = "KMS key for ${var.name_prefix} backup encryption"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${local.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow AWS Backup Service"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:CreateGrant",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-backup-key"
  })
}

# KMS key alias
resource "aws_kms_alias" "backup_key" {
  name          = "alias/${var.name_prefix}-backup-${var.environment}"
  target_key_id = aws_kms_key.backup_key.key_id
}

# Cross-region KMS key (if enabled)
resource "aws_kms_key" "backup_key_cross_region" {
  count    = var.enable_cross_region_backup ? 1 : 0
  provider = aws.backup_region
  
  description             = "Cross-region KMS key for ${var.name_prefix} backup encryption"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = true

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-backup-key-cross-region"
  })
}

# ================================
# AWS BACKUP SERVICE
# ================================

# AWS Backup vault
resource "aws_backup_vault" "main" {
  name        = "${var.name_prefix}-backup-vault-${var.environment}"
  kms_key_arn = aws_kms_key.backup_key.arn

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-backup-vault"
  })
}

# AWS Backup plan
resource "aws_backup_plan" "main" {
  name = "${var.name_prefix}-backup-plan-${var.environment}"

  # Daily backups with 30-day retention
  rule {
    rule_name         = "daily_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = local.backup_schedule_expressions.daily

    start_window      = 60  # Start within 1 hour
    completion_window = 300 # Complete within 5 hours

    lifecycle {
      cold_storage_after = 30
      delete_after       = var.backup_retention_days
    }

    recovery_point_tags = merge(local.common_tags, {
      BackupType = "daily"
      Automated  = "true"
    })

    # Copy to cross-region if enabled
    dynamic "copy_action" {
      for_each = var.enable_cross_region_backup ? [1] : []
      content {
        destination_vault_arn = aws_backup_vault.cross_region[0].arn
        lifecycle {
          cold_storage_after = 30
          delete_after       = var.backup_retention_days
        }
      }
    }
  }

  # Weekly backups with extended retention
  rule {
    rule_name         = "weekly_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = local.backup_schedule_expressions.weekly

    start_window      = 60
    completion_window = 480 # 8 hours for weekly

    lifecycle {
      cold_storage_after = 90
      delete_after       = var.backup_retention_days * 2
    }

    recovery_point_tags = merge(local.common_tags, {
      BackupType = "weekly"
      Automated  = "true"
    })
  }

  # Monthly backups with long-term retention
  rule {
    rule_name         = "monthly_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = local.backup_schedule_expressions.monthly

    start_window      = 60
    completion_window = 720 # 12 hours for monthly

    lifecycle {
      cold_storage_after = 90
      delete_after       = var.backup_retention_days * 4
    }

    recovery_point_tags = merge(local.common_tags, {
      BackupType = "monthly"
      Automated  = "true"
    })
  }

  tags = local.common_tags
}

# Cross-region backup vault (if enabled)
resource "aws_backup_vault" "cross_region" {
  count    = var.enable_cross_region_backup ? 1 : 0
  provider = aws.backup_region
  
  name        = "${var.name_prefix}-backup-vault-${var.environment}-dr"
  kms_key_arn = aws_kms_key.backup_key_cross_region[0].arn

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-cross-region-backup-vault"
  })
}

# ================================
# BACKUP SELECTION & RESOURCES
# ================================

# IAM role for AWS Backup
resource "aws_iam_role" "backup_role" {
  name = "${var.name_prefix}-backup-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Attach AWS managed backup policy
resource "aws_iam_role_policy_attachment" "backup_policy" {
  role       = aws_iam_role.backup_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

# Attach AWS managed restore policy
resource "aws_iam_role_policy_attachment" "restore_policy" {
  role       = aws_iam_role.backup_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# Custom backup policy for S3 and other resources
resource "aws_iam_role_policy" "backup_custom_policy" {
  name = "${var.name_prefix}-backup-custom-policy"
  role = aws_iam_role.backup_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetBucketVersioning",
          "s3:GetBucketNotification",
          "s3:PutBucketNotification",
          "s3:GetBucketTagging",
          "s3:GetInventoryConfiguration",
          "s3:PutInventoryConfiguration",
          "s3:ListBucketVersions",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:GetObjectVersionTagging",
          "s3:PutObject",
          "s3:PutObjectTagging",
          "s3:GetLifecycleConfiguration",
          "s3:PutLifecycleConfiguration",
          "s3:DeleteObject",
          "s3:DeleteObjectVersion"
        ]
        Resource = [
          aws_s3_bucket.primary_backup.arn,
          "${aws_s3_bucket.primary_backup.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:CreateGrant",
          "kms:DescribeKey"
        ]
        Resource = [
          aws_kms_key.backup_key.arn
        ]
      }
    ]
  })
}

# Backup selection for RDS instances
resource "aws_backup_selection" "rds" {
  count = length(var.rds_instance_arns) > 0 ? 1 : 0
  
  iam_role_arn = aws_iam_role.backup_role.arn
  name         = "${var.name_prefix}-rds-backup-selection"
  plan_id      = aws_backup_plan.main.id

  resources = var.rds_instance_arns

  tags = local.common_tags
}

# Backup selection for EFS file systems
resource "aws_backup_selection" "efs" {
  count = length(var.efs_file_system_arns) > 0 ? 1 : 0
  
  iam_role_arn = aws_iam_role.backup_role.arn
  name         = "${var.name_prefix}-efs-backup-selection"
  plan_id      = aws_backup_plan.main.id

  resources = var.efs_file_system_arns

  tags = local.common_tags
}

# Backup selection for EBS volumes
resource "aws_backup_selection" "ebs" {
  count = length(var.ebs_volume_arns) > 0 ? 1 : 0
  
  iam_role_arn = aws_iam_role.backup_role.arn
  name         = "${var.name_prefix}-ebs-backup-selection"
  plan_id      = aws_backup_plan.main.id

  resources = var.ebs_volume_arns

  tags = local.common_tags
}

# ================================
# APPLICATION-SPECIFIC BACKUPS
# ================================

# Lambda function for MongoDB backup
resource "aws_lambda_function" "mongodb_backup" {
  count = var.enable_mongodb_backup ? 1 : 0
  
  filename         = data.archive_file.mongodb_backup_zip[0].output_path
  function_name    = "${var.name_prefix}-mongodb-backup-${var.environment}"
  role            = aws_iam_role.mongodb_backup_lambda[0].arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = 900 # 15 minutes
  memory_size     = 512

  source_code_hash = data.archive_file.mongodb_backup_zip[0].output_base64sha256

  environment {
    variables = {
      MONGODB_URI           = var.mongodb_uri
      S3_BACKUP_BUCKET     = aws_s3_bucket.primary_backup.bucket
      ENVIRONMENT          = var.environment
      KMS_KEY_ID          = aws_kms_key.backup_key.key_id
      BACKUP_RETENTION_DAYS = var.backup_retention_days
    }
  }

  tags = local.common_tags
}

# MongoDB backup Lambda code
data "archive_file" "mongodb_backup_zip" {
  count = var.enable_mongodb_backup ? 1 : 0
  
  type        = "zip"
  output_path = "/tmp/mongodb-backup.zip"
  
  source {
    content = templatefile("${path.module}/lambda/mongodb-backup.js", {
      mongodb_uri       = var.mongodb_uri
      s3_bucket        = aws_s3_bucket.primary_backup.bucket
      kms_key_id       = aws_kms_key.backup_key.key_id
      retention_days   = var.backup_retention_days
    })
    filename = "index.js"
  }

  source {
    content  = file("${path.module}/lambda/package.json")
    filename = "package.json"
  }
}

# IAM role for MongoDB backup Lambda
resource "aws_iam_role" "mongodb_backup_lambda" {
  count = var.enable_mongodb_backup ? 1 : 0
  
  name = "${var.name_prefix}-mongodb-backup-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Lambda execution policy
resource "aws_iam_role_policy_attachment" "mongodb_backup_lambda_basic" {
  count = var.enable_mongodb_backup ? 1 : 0
  
  role       = aws_iam_role.mongodb_backup_lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Custom policy for MongoDB backup Lambda
resource "aws_iam_role_policy" "mongodb_backup_lambda_policy" {
  count = var.enable_mongodb_backup ? 1 : 0
  
  name = "${var.name_prefix}-mongodb-backup-lambda-policy"
  role = aws_iam_role.mongodb_backup_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.primary_backup.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.backup_key.arn
      }
    ]
  })
}

# EventBridge rule for MongoDB backup schedule
resource "aws_cloudwatch_event_rule" "mongodb_backup_schedule" {
  count = var.enable_mongodb_backup ? 1 : 0
  
  name                = "${var.name_prefix}-mongodb-backup-schedule"
  description         = "Trigger MongoDB backup Lambda function"
  schedule_expression = local.backup_schedule_expressions.daily

  tags = local.common_tags
}

# EventBridge target
resource "aws_cloudwatch_event_target" "mongodb_backup_target" {
  count = var.enable_mongodb_backup ? 1 : 0
  
  rule      = aws_cloudwatch_event_rule.mongodb_backup_schedule[0].name
  target_id = "MongoDBBackupTarget"
  arn       = aws_lambda_function.mongodb_backup[0].arn
}

# Lambda permission for EventBridge
resource "aws_lambda_permission" "mongodb_backup_eventbridge" {
  count = var.enable_mongodb_backup ? 1 : 0
  
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mongodb_backup[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.mongodb_backup_schedule[0].arn
}

# ================================
# MONITORING & NOTIFICATIONS
# ================================

# SNS topic for backup notifications
resource "aws_sns_topic" "backup_notifications" {
  name = "${var.name_prefix}-backup-notifications-${var.environment}"
  
  kms_master_key_id = aws_kms_key.backup_key.key_id

  tags = local.common_tags
}

# CloudWatch alarm for backup failures
resource "aws_cloudwatch_metric_alarm" "backup_failure" {
  alarm_name          = "${var.name_prefix}-backup-failure-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "NumberOfBackupJobsFailed"
  namespace           = "AWS/Backup"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors backup job failures"
  alarm_actions       = [aws_sns_topic.backup_notifications.arn]

  dimensions = {
    BackupVaultName = aws_backup_vault.main.name
  }

  tags = local.common_tags
}

# ================================
# S3 REPLICATION (if cross-region enabled)
# ================================

# S3 replication configuration
resource "aws_s3_bucket_replication_configuration" "primary_to_cross_region" {
  count = var.enable_cross_region_backup ? 1 : 0
  
  role   = aws_iam_role.s3_replication[0].arn
  bucket = aws_s3_bucket.primary_backup.id

  rule {
    id     = "cross-region-replication"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.cross_region_backup[0].arn
      storage_class = "STANDARD_IA"
      
      encryption_configuration {
        replica_kms_key_id = aws_kms_key.backup_key_cross_region[0].arn
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.primary_backup]
}

# IAM role for S3 replication
resource "aws_iam_role" "s3_replication" {
  count = var.enable_cross_region_backup ? 1 : 0
  
  name = "${var.name_prefix}-s3-replication-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# S3 replication policy
resource "aws_iam_role_policy" "s3_replication_policy" {
  count = var.enable_cross_region_backup ? 1 : 0
  
  name = "${var.name_prefix}-s3-replication-policy"
  role = aws_iam_role.s3_replication[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl"
        ]
        Resource = "${aws_s3_bucket.primary_backup.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.primary_backup.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete"
        ]
        Resource = "${aws_s3_bucket.cross_region_backup[0].arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = aws_kms_key.backup_key.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.backup_key_cross_region[0].arn
      }
    ]
  })
}
