# main.tf - Main Terraform configuration for School ERP SaaS

terraform {
  required_version = ">= 1.6.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
  
  backend "s3" {
    # Backend configuration will be provided via backend config file
    # or command line arguments during terraform init
  }
}

# Configure the AWS Provider
provider "aws" {
  region = var.region
  
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = var.owner
      CostCenter  = var.cost_center
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

# Local values
locals {
  account_id        = data.aws_caller_identity.current.account_id
  region           = data.aws_region.current.name
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 3)
  
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Region      = local.region
    AccountId   = local.account_id
  }
  
  # Resource naming convention
  name_prefix = "${var.project_name}-${var.environment}"
}

# Random password for RDS
resource "random_password" "rds_password" {
  length  = 32
  special = true
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"
  
  name_prefix        = local.name_prefix
  cidr_block        = var.vpc_cidr
  availability_zones = local.availability_zones
  environment       = var.environment
  
  # Subnets
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs
  
  # NAT Gateway configuration
  enable_nat_gateway = var.enable_nat_gateway
  single_nat_gateway = var.single_nat_gateway
  
  # VPC Endpoints
  enable_s3_endpoint      = true
  enable_dynamodb_endpoint = true
  
  tags = local.common_tags
}

# Security Groups Module
module "security_groups" {
  source = "./modules/security-groups"
  
  name_prefix = local.name_prefix
  vpc_id      = module.vpc.vpc_id
  environment = var.environment
  
  # CIDR blocks
  vpc_cidr = var.vpc_cidr
  
  tags = local.common_tags
}

# RDS Module
module "rds" {
  source = "./modules/rds"
  
  name_prefix = local.name_prefix
  environment = var.environment
  
  # Database configuration
  engine_version    = var.rds_engine_version
  instance_class   = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage
  storage_encrypted = true
  
  # Network configuration
  subnet_group_name   = module.vpc.database_subnet_group_name
  security_group_ids  = [module.security_groups.rds_security_group_id]
  
  # Database credentials
  database_name = var.database_name
  username     = var.database_username
  password     = random_password.rds_password.result
  
  # Backup configuration
  backup_retention_period = var.rds_backup_retention_period
  backup_window          = var.rds_backup_window
  maintenance_window     = var.rds_maintenance_window
  
  # Multi-AZ and performance
  multi_az               = var.environment == "production" ? true : false
  performance_insights_enabled = var.environment == "production" ? true : false
  
  tags = local.common_tags
}

# ElastiCache Redis Module
module "redis" {
  source = "./modules/redis"
  
  name_prefix = local.name_prefix
  environment = var.environment
  
  # Redis configuration
  node_type          = var.redis_node_type
  num_cache_nodes    = var.redis_num_cache_nodes
  parameter_group_name = var.redis_parameter_group_name
  engine_version     = var.redis_engine_version
  
  # Network configuration
  subnet_group_name  = module.vpc.elasticache_subnet_group_name
  security_group_ids = [module.security_groups.redis_security_group_id]
  
  # Backup configuration
  snapshot_retention_limit = var.redis_snapshot_retention_limit
  snapshot_window         = var.redis_snapshot_window
  
  # Multi-AZ for production
  automatic_failover_enabled = var.environment == "production" ? true : false
  
  tags = local.common_tags
}

# EKS Module
module "eks" {
  source = "./modules/eks"
  
  name_prefix = local.name_prefix
  environment = var.environment
  
  # Cluster configuration
  cluster_version = var.eks_cluster_version
  
  # Network configuration
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  control_plane_subnet_ids = module.vpc.private_subnet_ids
  
  # Security
  cluster_security_group_ids = [module.security_groups.eks_cluster_security_group_id]
  node_security_group_ids    = [module.security_groups.eks_node_security_group_id]
  
  # Node groups
  node_groups = var.eks_node_groups
  
  # Add-ons
  cluster_addons = var.eks_cluster_addons
  
  tags = local.common_tags
}

# Application Load Balancer Module
module "alb" {
  source = "./modules/alb"
  
  name_prefix = local.name_prefix
  environment = var.environment
  
  # Network configuration
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  
  # Security
  security_group_ids = [module.security_groups.alb_security_group_id]
  
  # SSL Certificate
  certificate_arn = var.ssl_certificate_arn
  
  # Target groups for EKS
  target_groups = [
    {
      name     = "${local.name_prefix}-api"
      port     = 80
      protocol = "HTTP"
      health_check = {
        path                = "/health"
        healthy_threshold   = 2
        unhealthy_threshold = 3
      }
    }
  ]
  
  tags = local.common_tags
}

# S3 Buckets Module
module "s3" {
  source = "./modules/s3"
  
  name_prefix = local.name_prefix
  environment = var.environment
  account_id  = local.account_id
  
  # Bucket configuration
  buckets = {
    app_storage = {
      versioning = true
      encryption = true
      lifecycle_rules = [
        {
          id     = "transition_to_ia"
          status = "Enabled"
          transitions = [
            {
              days          = 30
              storage_class = "STANDARD_IA"
            },
            {
              days          = 90
              storage_class = "GLACIER"
            }
          ]
        }
      ]
    }
    
    backup_storage = {
      versioning = true
      encryption = true
      lifecycle_rules = [
        {
          id     = "delete_old_backups"
          status = "Enabled"
          expiration = {
            days = var.backup_retention_days
          }
        }
      ]
    }
  }
  
  tags = local.common_tags
}

# IAM Module
module "iam" {
  source = "./modules/iam"
  
  name_prefix = local.name_prefix
  environment = var.environment
  
  # EKS configuration
  eks_cluster_name = module.eks.cluster_name
  
  # S3 bucket ARNs
  app_storage_bucket_arn    = module.s3.bucket_arns["app_storage"]
  backup_storage_bucket_arn = module.s3.bucket_arns["backup_storage"]
  
  tags = local.common_tags
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"
  
  name_prefix = local.name_prefix
  environment = var.environment
  
  # Resources to monitor
  vpc_id           = module.vpc.vpc_id
  rds_instance_id  = module.rds.instance_id
  redis_cluster_id = module.redis.cluster_id
  eks_cluster_name = module.eks.cluster_name
  alb_arn         = module.alb.load_balancer_arn
  
  # Notification
  sns_topic_arn = var.notification_sns_topic_arn
  
  tags = local.common_tags
}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.redis.endpoint
  sensitive   = true
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.dns_name
}

output "s3_bucket_names" {
  description = "S3 bucket names"
  value       = module.s3.bucket_names
}
