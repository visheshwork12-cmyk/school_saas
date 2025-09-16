
#Is file ko thik kra na hn end m

# Environment and Project Variables
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "development", "staging", "prod", "production"], var.environment)
    error_message = "Environment must be one of: dev, development, staging, prod, production."
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "school-erp"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# Networking Variables
variable "vpc_id" {
  description = "VPC ID where ECS resources will be created"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for load balancer"
  type        = list(string)
}

# ECS Configuration
variable "launch_type" {
  description = "ECS launch type"
  type        = string
  default     = "FARGATE"
  
  validation {
    condition     = contains(["FARGATE", "EC2"], var.launch_type)
    error_message = "Launch type must be either FARGATE or EC2."
  }
}

variable "capacity_providers" {
  description = "List of capacity providers for the ECS cluster"
  type        = list(string)
  default     = ["FARGATE", "FARGATE_SPOT"]
}

variable "default_capacity_provider" {
  description = "Default capacity provider"
  type        = string
  default     = "FARGATE"
}

# Task Configuration
variable "task_cpu" {
  description = "CPU units for the task (1024 = 1 vCPU)"
  type        = number
  default     = 512
  
  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.task_cpu)
    error_message = "Task CPU must be one of: 256, 512, 1024, 2048, 4096."
  }
}

variable "task_memory" {
  description = "Memory for the task in MB"
  type        = number
  default     = 1024
  
  validation {
    condition     = var.task_memory >= 512 && var.task_memory <= 30720
    error_message = "Task memory must be between 512 and 30720 MB."
  }
}

variable "container_port" {
  description = "Port on which the container listens"
  type        = number
  default     = 3000
}

# Docker Configuration
variable "docker_image_uri" {
  description = "URI of the Docker image to deploy"
  type        = string
}

# Service Configuration
variable "desired_count" {
  description = "Desired number of running tasks"
  type        = number
  default     = 2
  
  validation {
    condition     = var.desired_count >= 1
    error_message = "Desired count must be at least 1."
  }
}

# Auto Scaling Configuration
variable "min_capacity" {
  description = "Minimum number of running tasks"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of running tasks"
  type        = number
  default     = 10
}

variable "cpu_target_value" {
  description = "Target CPU utilization percentage for auto scaling"
  type        = number
  default     = 70
  
  validation {
    condition     = var.cpu_target_value > 0 && var.cpu_target_value <= 100
    error_message = "CPU target value must be between 1 and 100."
  }
}

variable "memory_target_value" {
  description = "Target memory utilization percentage for auto scaling"
  type        = number
  default     = 70
  
  validation {
    condition     = var.memory_target_value > 0 && var.memory_target_value <= 100
    error_message = "Memory target value must be between 1 and 100."
  }
}

variable "scale_in_cooldown" {
  description = "Scale in cooldown period in seconds"
  type        = number
  default     = 300
}

variable "scale_out_cooldown" {
  description = "Scale out cooldown period in seconds"
  type        = number
  default     = 300
}

# Deployment Configuration
variable "max_capacity_during_deployment" {
  description = "Maximum percentage of desired count during deployment"
  type        = number
  default     = 200
  
  validation {
    condition     = var.max_capacity_during_deployment >= 100 && var.max_capacity_during_deployment <= 200
    error_message = "Max capacity during deployment must be between 100 and 200."
  }
}

variable "min_capacity_during_deployment" {
  description = "Minimum percentage of desired count during deployment"
  type        = number
  default     = 50
  
  validation {
    condition     = var.min_capacity_during_deployment >= 0 && var.min_capacity_during_deployment <= 100
    error_message = "Min capacity during deployment must be between 0 and 100."
  }
}

# SSL Certificate
variable "ssl_certificate_arn" {
  description = "ARN of the SSL certificate for HTTPS"
  type        = string
  default     = ""
}

# Secrets Manager ARNs
variable "mongodb_uri_secret_arn" {
  description = "ARN of the MongoDB URI secret in AWS Secrets Manager"
  type        = string
}

variable "jwt_access_secret_arn" {
  description = "ARN of the JWT access secret in AWS Secrets Manager"
  type        = string
}

variable "jwt_refresh_secret_arn" {
  description = "ARN of the JWT refresh secret in AWS Secrets Manager"
  type        = string
}

variable "cloudinary_cloud_name_secret_arn" {
  description = "ARN of the Cloudinary cloud name secret in AWS Secrets Manager"
  type        = string
}

variable "cloudinary_api_key_secret_arn" {
  description = "ARN of the Cloudinary API key secret in AWS Secrets Manager"
  type        = string
}

variable "cloudinary_api_secret_secret_arn" {
  description = "ARN of the Cloudinary API secret in AWS Secrets Manager"
  type        = string
}

variable "sentry_dsn_secret_arn" {
  description = "ARN of the Sentry DSN secret in AWS Secrets Manager"
  type        = string
}

variable "secrets_manager_arns" {
  description = "List of all Secrets Manager ARNs that ECS tasks need access to"
  type        = list(string)
  default     = []
}

# S3 Configuration
variable "s3_bucket_arns" {
  description = "List of S3 bucket ARNs that ECS tasks need access to"
  type        = list(string)
  default     = []
}

# Monitoring Configuration
variable "enable_container_insights" {
  description = "Enable CloudWatch Container Insights for the cluster"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 30
  
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch log retention period."
  }
}

variable "sns_topic_arns" {
  description = "List of SNS topic ARNs for CloudWatch alarms"
  type        = list(string)
  default     = []
}

# Redis Configuration (if using ElastiCache)
variable "redis_cluster_endpoint" {
  description = "Redis cluster endpoint"
  type        = string
  default     = ""
}

variable "redis_auth_token_secret_arn" {
  description = "ARN of the Redis auth token secret in AWS Secrets Manager"
  type        = string
  default     = ""
}

# Tags
variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "school-erp-saas"
    ManagedBy   = "terraform"
    Owner       = "platform-team"
  }
}

# Feature Flags
variable "enable_service_discovery" {
  description = "Enable ECS service discovery"
  type        = bool
  default     = true
}

variable "enable_auto_scaling" {
  description = "Enable auto scaling for the ECS service"
  type        = bool
  default     = true
}

variable "enable_load_balancer" {
  description = "Enable Application Load Balancer"
  type        = bool
  default     = true
}

# Multi-tenant Configuration
variable "enable_multi_tenant" {
  description = "Enable multi-tenant configuration"
  type        = bool
  default     = true
}

variable "default_tenant_id" {
  description = "Default tenant ID for the application"
  type        = string
  default     = "default"
}

# Health Check Configuration
variable "health_check_path" {
  description = "Health check endpoint path"
  type        = string
  default     = "/health"
}

variable "health_check_interval" {
  description = "Health check interval in seconds"
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Health check timeout in seconds"
  type        = number
  default     = 10
}

variable "health_check_healthy_threshold" {
  description = "Number of consecutive successful health checks"
  type        = number
  default     = 2
}

variable "health_check_unhealthy_threshold" {
  description = "Number of consecutive failed health checks"
  type        = number
  default     = 10
}


# config/infrastructure/terraform/modules/ecs/variables.tf
# Variables for ECS Auto Scaling Module

# Basic Configuration
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "school-erp-saas"
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "cluster_id" {
  description = "ECS Cluster ID"
  type        = string
}

variable "cluster_name" {
  description = "ECS Cluster Name"
  type        = string
}

# Auto Scaling Configuration
variable "min_capacity" {
  description = "Minimum number of tasks"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum number of tasks"
  type        = number
  default     = 10
}

variable "cpu_target_value" {
  description = "Target CPU utilization percentage for auto scaling"
  type        = number
  default     = 70.0
}

variable "memory_target_value" {
  description = "Target memory utilization percentage for auto scaling"
  type        = number
  default     = 80.0
}

variable "request_count_target_value" {
  description = "Target request count per target for auto scaling"
  type        = number
  default     = 1000.0
}

# Scaling Behavior Configuration
variable "scale_out_cooldown" {
  description = "Cooldown period (in seconds) for scale out operations"
  type        = number
  default     = 300
}

variable "scale_in_cooldown" {
  description = "Cooldown period (in seconds) for scale in operations"
  type        = number
  default     = 600
}

# CloudWatch Alarm Thresholds
variable "high_cpu_threshold" {
  description = "High CPU threshold for emergency scaling"
  type        = number
  default     = 85.0
}

variable "low_cpu_threshold" {
  description = "Low CPU threshold for scaling in"
  type        = number
  default     = 20.0
}

variable "high_memory_threshold" {
  description = "High memory threshold for alerts"
  type        = number
  default     = 90.0
}

variable "response_time_threshold" {
  description = "Response time threshold in seconds"
  type        = number
  default     = 2.0
}

variable "min_healthy_tasks" {
  description = "Minimum number of healthy tasks"
  type        = number
  default     = 1
}

# Network Configuration
variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for ECS service"
  type        = string
}

# Load Balancer Configuration
variable "target_group_arn" {
  description = "Target group ARN for load balancer"
  type        = string
}

variable "target_group_full_name" {
  description = "Full name of the target group for CloudWatch dimensions"
  type        = string
}

variable "alb_full_name" {
  description = "Full name of the ALB for CloudWatch dimensions"
  type        = string
}

# Service Discovery
variable "service_discovery_namespace_id" {
  description = "Service discovery namespace ID"
  type        = string
  default     = ""
}

# Task Definition Configuration
variable "task_family" {
  description = "Task definition family name"
  type        = string
  default     = "school-erp-task"
}

variable "task_cpu" {
  description = "Task CPU units (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "task_memory" {
  description = "Task memory in MiB"
  type        = number
  default     = 2048
}

# Container Configuration
variable "container_image" {
  description = "Container image URI"
  type        = string
}

variable "container_port" {
  description = "Container port"
  type        = number
  default     = 3000
}

# Environment-specific scaling parameters
variable "scaling_policies" {
  description = "Environment-specific scaling policies"
  type = object({
    development = object({
      min_capacity = number
      max_capacity = number
      cpu_target   = number
      memory_target = number
    })
    staging = object({
      min_capacity = number
      max_capacity = number
      cpu_target   = number
      memory_target = number
    })
    production = object({
      min_capacity = number
      max_capacity = number
      cpu_target   = number
      memory_target = number
    })
  })
  default = {
    development = {
      min_capacity  = 1
      max_capacity  = 3
      cpu_target    = 80.0
      memory_target = 85.0
    }
    staging = {
      min_capacity  = 2
      max_capacity  = 6
      cpu_target    = 75.0
      memory_target = 80.0
    }
    production = {
      min_capacity  = 3
      max_capacity  = 15
      cpu_target    = 70.0
      memory_target = 75.0
    }
  }
}

