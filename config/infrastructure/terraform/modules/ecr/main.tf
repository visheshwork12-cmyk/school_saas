# infrastructure/terraform/modules/ecr/main.tf
# ECR Module for School ERP SaaS - Container Registry

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Local values
locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  
  common_tags = merge(var.tags, {
    Component   = "ecr"
    Service     = "container-registry"
    Environment = var.environment
    ManagedBy   = "terraform"
  })

  # Repository configurations
  repositories = merge(var.repositories, {
    # Default repositories for the application
    "${var.name_prefix}-api" = {
      description           = "Main API application container"
      image_tag_mutability = "MUTABLE"
      scan_on_push         = true
      lifecycle_policy     = "default"
      cross_region_replication = var.enable_cross_region_replication
    }
    "${var.name_prefix}-worker" = {
      description           = "Background worker container"
      image_tag_mutability = "MUTABLE"
      scan_on_push         = true
      lifecycle_policy     = "default"
      cross_region_replication = var.enable_cross_region_replication
    }
    "${var.name_prefix}-migration" = {
      description           = "Database migration container"
      image_tag_mutability = "MUTABLE"
      scan_on_push         = true
      lifecycle_policy     = "migration"
      cross_region_replication = false
    }
  })

  # Lifecycle policies
  lifecycle_policies = {
    default = jsonencode({
      rules = [
        {
          rulePriority = 1
          description  = "Keep last 10 production images"
          selection = {
            tagStatus     = "tagged"
            tagPrefixList = ["v", "prod", "release"]
            countType     = "imageCountMoreThan"
            countNumber   = 10
          }
          action = {
            type = "expire"
          }
        },
        {
          rulePriority = 2
          description  = "Keep last 5 staging images"
          selection = {
            tagStatus     = "tagged"
            tagPrefixList = ["staging", "stage"]
            countType     = "imageCountMoreThan"
            countNumber   = 5
          }
          action = {
            type = "expire"
          }
        },
        {
          rulePriority = 3
          description  = "Keep last 3 development images"
          selection = {
            tagStatus     = "tagged"
            tagPrefixList = ["dev", "feature", "hotfix"]
            countType     = "imageCountMoreThan"
            countNumber   = 3
          }
          action = {
            type = "expire"
          }
        },
        {
          rulePriority = 4
          description  = "Delete untagged images older than 1 day"
          selection = {
            tagStatus   = "untagged"
            countType   = "sinceImagePushed"
            countUnit   = "days"
            countNumber = 1
          }
          action = {
            type = "expire"
          }
        }
      ]
    })

    migration = jsonencode({
      rules = [
        {
          rulePriority = 1
          description  = "Keep last 5 migration images"
          selection = {
            tagStatus   = "any"
            countType   = "imageCountMoreThan"
            countNumber = 5
          }
          action = {
            type = "expire"
          }
        },
        {
          rulePriority = 2
          description  = "Delete images older than 30 days"
          selection = {
            tagStatus   = "any"
            countType   = "sinceImagePushed"
            countUnit   = "days"
            countNumber = 30
          }
          action = {
            type = "expire"
          }
        }
      ]
    })

    long_term = jsonencode({
      rules = [
        {
          rulePriority = 1
          description  = "Keep last 50 images"
          selection = {
            tagStatus   = "any"
            countType   = "imageCountMoreThan"
            countNumber = 50
          }
          action = {
            type = "expire"
          }
        }
      ]
    })
  }
}

# KMS key for ECR encryption
resource "aws_kms_key" "ecr" {
  count = var.enable_encryption ? 1 : 0

  description             = "KMS key for ECR encryption - ${var.name_prefix}"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = true

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ecr-key"
  })
}

resource "aws_kms_alias" "ecr" {
  count = var.enable_encryption ? 1 : 0

  name          = "alias/${var.name_prefix}-ecr"
  target_key_id = aws_kms_key.ecr[0].key_id
}

# ECR Repositories
resource "aws_ecr_repository" "repositories" {
  for_each = local.repositories

  name                 = each.key
  image_tag_mutability = each.value.image_tag_mutability

  # Image scanning configuration
  image_scanning_configuration {
    scan_on_push = each.value.scan_on_push
  }

  # Encryption configuration
  dynamic "encryption_configuration" {
    for_each = var.enable_encryption ? [1] : []
    content {
      encryption_type = "KMS"
      kms_key         = aws_kms_key.ecr[0].arn
    }
  }

  tags = merge(local.common_tags, {
    Name        = each.key
    Description = each.value.description
  })

  # Lifecycle management
  lifecycle {
    prevent_destroy = var.prevent_destroy
  }
}

# Repository policies
resource "aws_ecr_repository_policy" "policies" {
  for_each = var.repository_read_write_access_arns != null ? local.repositories : {}

  repository = aws_ecr_repository.repositories[each.key].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowPull"
        Effect = "Allow"
        Principal = {
          AWS = var.repository_read_access_arns
        }
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetRepositoryPolicy",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings",
          "ecr:GetLifecyclePolicy",
          "ecr:GetLifecyclePolicyPreview",
          "ecr:ListImages",
          "ecr:ListTagsForResource"
        ]
      },
      {
        Sid    = "AllowPushPull"
        Effect = "Allow"
        Principal = {
          AWS = var.repository_read_write_access_arns
        }
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings",
          "ecr:GetRepositoryPolicy",
          "ecr:GetLifecyclePolicy",
          "ecr:GetLifecyclePolicyPreview",
          "ecr:ListImages",
          "ecr:ListTagsForResource"
        ]
      }
    ]
  })
}

# Lifecycle policies
resource "aws_ecr_lifecycle_policy" "policies" {
  for_each = local.repositories

  repository = aws_ecr_repository.repositories[each.key].name
  policy     = local.lifecycle_policies[each.value.lifecycle_policy]
}

# Cross-region replication configuration
resource "aws_ecr_replication_configuration" "replication" {
  count = var.enable_cross_region_replication ? 1 : 0

  replication_configuration {
    rule {
      destination {
        region      = var.replication_region
        registry_id = local.account_id
      }

      # Repository filter
      repository_filter {
        filter      = "${var.name_prefix}-*"
        filter_type = "PREFIX_MATCH"
      }
    }
  }

  depends_on = [aws_ecr_repository.repositories]
}

# CloudWatch Log Group for ECR
resource "aws_cloudwatch_log_group" "ecr" {
  name              = "/aws/ecr/${var.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.enable_encryption ? aws_kms_key.ecr[0].arn : null

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ecr-logs"
  })
}

# ECR Registry scanning configuration
resource "aws_ecr_registry_scanning_configuration" "scanning" {
  scan_type = var.enhanced_scanning ? "ENHANCED" : "BASIC"

  dynamic "rule" {
    for_each = var.enhanced_scanning ? var.scanning_rules : []
    content {
      scan_frequency = rule.value.scan_frequency
      repository_filter {
        filter      = rule.value.repository_filter
        filter_type = rule.value.filter_type
      }
    }
  }
}

# Registry policy for organization-wide settings
resource "aws_ecr_registry_policy" "policy" {
  count = var.registry_policy != null ? 1 : 0

  policy = var.registry_policy
}
