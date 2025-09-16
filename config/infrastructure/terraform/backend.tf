# infrastructure/terraform/backend.tf
# Terraform Backend Configuration for School ERP SaaS
# Provides state management with S3 and DynamoDB for state locking

terraform {
  required_version = ">= 1.6.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # S3 Backend Configuration
  backend "s3" {
    # Bucket will be created manually or via bootstrap script
    bucket = "school-erp-terraform-state-${var.environment}"
    key    = "infrastructure/terraform.tfstate"
    region = var.aws_region
    
    # DynamoDB table for state locking
    dynamodb_table = "school-erp-terraform-locks-${var.environment}"
    
    # Encryption settings
    encrypt        = true
    kms_key_id     = "arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alias/terraform-state-key"
    
    # Versioning and lifecycle
    versioning = true
    
    # Workspace support
    workspace_key_prefix = "workspaces"
    
    # Additional security
    skip_credentials_validation = false
    skip_metadata_api_check     = false
    skip_region_validation      = false
    
    # Tags for state bucket (applied via separate resource)
    tags = {
      Name        = "school-erp-terraform-state-${var.environment}"
      Environment = var.environment
      Project     = "school-erp-saas"
      Component   = "terraform-backend"
      ManagedBy   = "terraform"
    }
  }
}

# Data source to get current AWS account ID
data "aws_caller_identity" "current" {}

# Data source to get current AWS region
data "aws_region" "current" {}

# Local values for backend configuration
locals {
  backend_bucket_name = "school-erp-terraform-state-${var.environment}"
  lock_table_name     = "school-erp-terraform-locks-${var.environment}"
  
  common_tags = {
    Project     = "school-erp-saas"
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "backend"
  }
}

# S3 Bucket for Terraform State (if not exists)
resource "aws_s3_bucket" "terraform_state" {
  bucket        = local.backend_bucket_name
  force_destroy = var.environment == "development" ? true : false

  tags = merge(local.common_tags, {
    Name        = local.backend_bucket_name
    Description = "Terraform state storage for School ERP SaaS"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "terraform_state_versioning" {
  bucket = aws_s3_bucket.terraform_state.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket Server Side Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state_encryption" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.terraform_state.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# S3 Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Bucket Policy for State Access
resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureConnections"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# DynamoDB Table for State Locking
resource "aws_dynamodb_table" "terraform_locks" {
  name           = local.lock_table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = merge(local.common_tags, {
    Name        = local.lock_table_name
    Description = "Terraform state locking for School ERP SaaS"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# KMS Key for State Encryption
resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = var.environment == "production" ? 30 : 7

  tags = merge(local.common_tags, {
    Name = "terraform-state-key-${var.environment}"
  })
}

# KMS Key Alias
resource "aws_kms_alias" "terraform_state" {
  name          = "alias/terraform-state-key-${var.environment}"
  target_key_id = aws_kms_key.terraform_state.key_id
}

# Outputs
output "backend_config" {
  description = "Backend configuration details"
  value = {
    bucket         = aws_s3_bucket.terraform_state.bucket
    dynamodb_table = aws_dynamodb_table.terraform_locks.name
    kms_key_id     = aws_kms_key.terraform_state.arn
    region         = data.aws_region.current.name
  }
}
