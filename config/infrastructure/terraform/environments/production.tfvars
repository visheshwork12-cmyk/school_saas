# production.tfvars - Production environment configuration

# Basic Configuration
region      = "us-east-1"
environment = "production"
owner       = "Platform Team"
cost_center = "Production"

# Network Configuration
vpc_cidr = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
private_subnet_cidrs = ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
database_subnet_cidrs = ["10.0.50.0/24", "10.0.60.0/24", "10.0.70.0/24"]

# NAT Gateway - Multiple for production
enable_nat_gateway = true
single_nat_gateway = false

# RDS Configuration - Production optimized
rds_instance_class           = "db.r6g.xlarge"
rds_allocated_storage        = 500
rds_backup_retention_period  = 30
rds_backup_window           = "03:00-04:00"
rds_maintenance_window      = "sun:04:00-sun:06:00"

# Redis Configuration - Production cluster
redis_node_type              = "cache.r6g.large"
redis_num_cache_nodes        = 3
redis_snapshot_retention_limit = 14
redis_snapshot_window        = "03:00-05:00"

# EKS Configuration - Production ready
eks_cluster_version = "1.28"

eks_node_groups = {
  general = {
    instance_types = ["m6i.large", "m6i.xlarge"]
    capacity_type  = "ON_DEMAND"
    scaling_config = {
      desired_size = 6
      max_size     = 20
      min_size     = 3
    }
    update_config = {
      max_unavailable_percentage = 25
    }
  }
  
  spot = {
    instance_types = ["m6i.large", "m5.large", "c5.large"]
    capacity_type  = "SPOT"
    scaling_config = {
      desired_size = 3
      max_size     = 15
      min_size     = 0
    }
    update_config = {
      max_unavailable_percentage = 50
    }
  }
}

# SSL Certificate ARN (replace with actual ARN)
ssl_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID"

# Backup retention
backup_retention_days = 90

# Monitoring
notification_sns_topic_arn = "arn:aws:sns:us-east-1:ACCOUNT_ID:school-erp-alerts"



# config/infrastructure/terraform/environments/production.tfvars
# Production Environment ECS Auto Scaling Configuration

project_name = "school-erp-saas"
environment  = "production"
region      = "us-east-1"

# Production Auto Scaling Configuration
scaling_policies = {
  production = {
    min_capacity  = 3
    max_capacity  = 20
    cpu_target    = 70.0
    memory_target = 75.0
  }
}

# Production-specific variables
mongodb_uri = "mongodb+srv://prod-user:password@prod-cluster.mongodb.net/school-erp-prod"
jwt_secret  = "production-jwt-secret-key-minimum-32-characters-long"

# Enhanced monitoring for production
enable_container_insights = true
log_retention_days       = 30

# Performance optimization
task_cpu_production    = 2048  # 2 vCPU
task_memory_production = 4096  # 4 GB RAM

# Advanced scaling thresholds
cpu_scale_out_threshold    = 70.0
cpu_scale_in_threshold     = 30.0
memory_scale_out_threshold = 75.0
memory_scale_in_threshold  = 40.0

# Cooldown periods (production-optimized)
scale_out_cooldown_production = 300  # 5 minutes
scale_in_cooldown_production  = 600  # 10 minutes


backup_retention_days = 90
backup_notification_emails = ["ops@yourschool.com", "admin@yourschool.com"]
mongodb_uri = "your-production-mongodb-uri"

