# config/infrastructure/terraform/ecs-autoscaling.tf
# Main ECS Auto Scaling Configuration

# Local values for environment-specific configuration
locals {
  scaling_config = var.scaling_policies[var.environment]
  
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Component   = "ecs-autoscaling"
    ManagedBy   = "terraform"
  }
}

# ECS Module with Auto Scaling
module "ecs_service" {
  source = "./modules/ecs"
  
  # Basic Configuration
  project_name = var.project_name
  environment  = var.environment
  
  # Cluster Configuration
  cluster_id   = aws_ecs_cluster.main.id
  cluster_name = aws_ecs_cluster.main.name
  
  # Auto Scaling Configuration (Environment-specific)
  min_capacity              = local.scaling_config.min_capacity
  max_capacity              = local.scaling_config.max_capacity
  cpu_target_value          = local.scaling_config.cpu_target
  memory_target_value       = local.scaling_config.memory_target
  request_count_target_value = 1000
  
  # Scaling Behavior
  scale_out_cooldown = var.environment == "production" ? 300 : 600
  scale_in_cooldown  = var.environment == "production" ? 600 : 900
  
  # CloudWatch Thresholds (Environment-specific)
  high_cpu_threshold      = var.environment == "production" ? 85.0 : 90.0
  low_cpu_threshold       = var.environment == "production" ? 15.0 : 10.0
  high_memory_threshold   = var.environment == "production" ? 85.0 : 90.0
  response_time_threshold = var.environment == "production" ? 1.5 : 2.0
  min_healthy_tasks       = local.scaling_config.min_capacity > 1 ? 1 : 0
  
  # Network Configuration
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = aws_security_group.ecs_service.id
  
  # Load Balancer Configuration
  target_group_arn       = aws_lb_target_group.ecs_service.arn
  target_group_full_name = aws_lb_target_group.ecs_service.arn_suffix
  alb_full_name         = aws_lb.main.arn_suffix
  
  # Container Configuration
  container_image = "${aws_ecr_repository.school_erp.repository_url}:latest"
  container_port  = 3000
  task_cpu        = var.environment == "production" ? 1024 : 512
  task_memory     = var.environment == "production" ? 2048 : 1024
  
  # Secrets (from environment variables or AWS Secrets Manager)
  mongodb_uri = var.mongodb_uri
  jwt_secret  = var.jwt_secret
  
  tags = local.common_tags
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"
  
  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      
      log_configuration {
        cloud_watch_encryption_enabled = true
        cloud_watch_log_group_name     = aws_cloudwatch_log_group.ecs_cluster.name
      }
    }
  }
  
  setting {
    name  = "containerInsights"
    value = var.environment == "production" ? "enabled" : "disabled"
  }
  
  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-cluster"
  })
}

# Cluster CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs_cluster" {
  name              = "/aws/ecs/${var.project_name}-${var.environment}-cluster"
  retention_in_days = var.environment == "production" ? 30 : 7
  
  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-cluster-logs"
  })
}

# Security Group for ECS Service
resource "aws_security_group" "ecs_service" {
  name        = "${var.project_name}-${var.environment}-ecs-service"
  description = "Security group for ECS service"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "HTTP from ALB"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }
  
  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-ecs-service"
  })
}
