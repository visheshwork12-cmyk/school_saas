# config/infrastructure/terraform/modules/secrets/main.tf
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.1"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_kms_key" "secrets_manager" {
  count  = var.kms_key_id != null ? 1 : 0
  key_id = var.kms_key_id
}

# Local values
locals {
  common_tags = merge(var.tags, {
    Module      = "secrets-manager"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
  
  # Environment-specific configurations
  environment_config = {
    development = {
      recovery_window = 7
      replica_regions = []
      rotation_enabled = false
    }
    staging = {
      recovery_window = 14
      replica_regions = []
      rotation_enabled = false
    }
    production = {
      recovery_window = 30
      replica_regions = var.replica_regions
      rotation_enabled = true
    }
  }
  
  config = local.environment_config[var.environment]
}

# Generate random passwords for database secrets
resource "random_password" "database_passwords" {
  for_each = var.database_secrets
  
  length  = each.value.length != null ? each.value.length : 32
  special = each.value.special != null ? each.value.special : true
  
  # Avoid characters that might cause issues in connection strings
  override_special = "!@#$%^&*()_+-=[]{}|;:,.<>?"
  
  lifecycle {
    ignore_changes = all
  }
}

# Generate random API keys/tokens
resource "random_password" "api_tokens" {
  for_each = var.api_secrets
  
  length  = each.value.length != null ? each.value.length : 64
  special = false
  upper   = true
  lower   = true
  numeric = true
  
  lifecycle {
    ignore_changes = all
  }
}

# Database connection secrets
resource "aws_secretsmanager_secret" "database_secrets" {
  for_each = var.database_secrets
  
  name        = "${var.name_prefix}/${each.key}"
  description = each.value.description != null ? each.value.description : "Database credentials for ${each.key}"
  
  # KMS encryption
  kms_key_id = var.kms_key_id
  
  # Recovery window
  recovery_window_in_days = each.value.recovery_window != null ? each.value.recovery_window : local.config.recovery_window
  
  # Cross-region replication
  dynamic "replica" {
    for_each = local.config.replica_regions
    content {
      region     = replica.value.region
      kms_key_id = replica.value.kms_key_id
    }
  }
  
  tags = merge(local.common_tags, {
    Name        = "${var.name_prefix}/${each.key}"
    SecretType  = "database"
    Application = each.value.application != null ? each.value.application : "school-erp"
  }, each.value.tags != null ? each.value.tags : {})
}

# Database secret versions
resource "aws_secretsmanager_secret_version" "database_secret_versions" {
  for_each = var.database_secrets
  
  secret_id = aws_secretsmanager_secret.database_secrets[each.key].id
  
  secret_string = jsonencode({
    username = each.value.username
    password = each.value.use_generated_password ? random_password.database_passwords[each.key].result : each.value.password
    host     = each.value.host
    port     = each.value.port != null ? each.value.port : 5432
    dbname   = each.value.database_name
    engine   = each.value.engine != null ? each.value.engine : "postgres"
    
    # Connection string for convenience
    connection_string = "${each.value.engine != null ? each.value.engine : "postgres"}://${each.value.username}:${each.value.use_generated_password ? random_password.database_passwords[each.key].result : each.value.password}@${each.value.host}:${each.value.port != null ? each.value.port : 5432}/${each.value.database_name}"
  })
  
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# API secrets (JWT tokens, API keys, etc.)
resource "aws_secretsmanager_secret" "api_secrets" {
  for_each = var.api_secrets
  
  name        = "${var.name_prefix}/api/${each.key}"
  description = each.value.description != null ? each.value.description : "API credentials for ${each.key}"
  
  kms_key_id = var.kms_key_id
  recovery_window_in_days = each.value.recovery_window != null ? each.value.recovery_window : local.config.recovery_window
  
  dynamic "replica" {
    for_each = local.config.replica_regions
    content {
      region     = replica.value.region
      kms_key_id = replica.value.kms_key_id
    }
  }
  
  tags = merge(local.common_tags, {
    Name        = "${var.name_prefix}/api/${each.key}"
    SecretType  = "api"
    Application = each.value.application != null ? each.value.application : "school-erp"
  }, each.value.tags != null ? each.value.tags : {})
}

# API secret versions
resource "aws_secretsmanager_secret_version" "api_secret_versions" {
  for_each = var.api_secrets
  
  secret_id = aws_secretsmanager_secret.api_secrets[each.key].id
  
  secret_string = jsonencode(merge(
    {
      api_key = each.value.use_generated_token ? random_password.api_tokens[each.key].result : each.value.api_key
    },
    each.value.additional_fields != null ? each.value.additional_fields : {}
  ))
  
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Third-party service secrets (Stripe, SendGrid, etc.)
resource "aws_secretsmanager_secret" "service_secrets" {
  for_each = var.service_secrets
  
  name        = "${var.name_prefix}/services/${each.key}"
  description = each.value.description != null ? each.value.description : "Service credentials for ${each.key}"
  
  kms_key_id = var.kms_key_id
  recovery_window_in_days = each.value.recovery_window != null ? each.value.recovery_window : local.config.recovery_window
  
  dynamic "replica" {
    for_each = local.config.replica_regions
    content {
      region     = replica.value.region
      kms_key_id = replica.value.kms_key_id
    }
  }
  
  tags = merge(local.common_tags, {
    Name        = "${var.name_prefix}/services/${each.key}"
    SecretType  = "service"
    Service     = each.key
    Application = "school-erp"
  }, each.value.tags != null ? each.value.tags : {})
}

# Service secret versions
resource "aws_secretsmanager_secret_version" "service_secret_versions" {
  for_each = var.service_secrets
  
  secret_id = aws_secretsmanager_secret.service_secrets[each.key].id
  secret_string = jsonencode(each.value.secret_data)
  
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Automatic rotation for database secrets
resource "aws_secretsmanager_secret_rotation" "database_rotation" {
  for_each = {
    for k, v in var.database_secrets : k => v
    if v.enable_rotation == true && local.config.rotation_enabled
  }
  
  secret_id           = aws_secretsmanager_secret.database_secrets[each.key].id
  rotation_lambda_arn = each.value.rotation_lambda_arn
  
  rotation_rules {
    automatically_after_days = each.value.rotation_interval != null ? each.value.rotation_interval : 30
  }
  
  depends_on = [aws_secretsmanager_secret_version.database_secret_versions]
}

# IAM policy for accessing secrets
resource "aws_iam_policy" "secrets_access" {
  count = var.create_access_policy ? 1 : 0
  
  name        = "${var.name_prefix}-secrets-access"
  description = "Policy for accessing ${var.name_prefix} secrets"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = concat(
          [for secret in aws_secretsmanager_secret.database_secrets : secret.arn],
          [for secret in aws_secretsmanager_secret.api_secrets : secret.arn],
          [for secret in aws_secretsmanager_secret.service_secrets : secret.arn]
        )
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_id != null ? [data.aws_kms_key.secrets_manager[0].arn] : ["*"]
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${data.aws_region.current.name}.amazonaws.com"
          }
        }
      }
    ]
  })
  
  tags = local.common_tags
}

# CloudWatch Log Group for rotation logs
resource "aws_cloudwatch_log_group" "rotation_logs" {
  count = var.enable_rotation_logs ? 1 : 0
  
  name              = "/aws/secretsmanager/${var.name_prefix}"
  retention_in_days = var.log_retention_days
  
  kms_key_id = var.kms_key_id
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-rotation-logs"
  })
}
