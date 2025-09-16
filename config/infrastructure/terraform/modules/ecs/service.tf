# config/infrastructure/terraform/modules/ecs/service.tf
# ECS Service with Auto Scaling Support

resource "aws_ecs_service" "school_erp_service" {
  name            = "${var.project_name}-${var.environment}-service"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.school_erp_task.arn
  
  # Service Configuration
  desired_count                      = var.min_capacity
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent        = 200
  
  # Platform Configuration
  platform_version = "LATEST"
  launch_type      = "FARGATE"
  
  # Network Configuration
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = false
  }
  
  # Load Balancer Configuration
  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "school-erp-api"
    container_port   = 3000
  }
  
  # Service Discovery (Optional)
  service_registries {
    registry_arn = aws_service_discovery_service.school_erp_discovery.arn
  }
  
  # Deployment Configuration
  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 50
    
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
  }
  
  # Enable ECS Managed Tags
  enable_ecs_managed_tags = true
  propagate_tags         = "SERVICE"
  
  # Health Check Grace Period
  health_check_grace_period_seconds = 300
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-service"
    Environment = var.environment
    Project     = var.project_name
    Component   = "ecs-service"
    AutoScaling = "enabled"
  }
  
  lifecycle {
    ignore_changes = [desired_count]
  }
  
  depends_on = [
    aws_ecs_task_definition.school_erp_task,
    var.target_group_arn
  ]
}

# Service Discovery
resource "aws_service_discovery_service" "school_erp_discovery" {
  name = "${var.project_name}-${var.environment}-discovery"
  
  dns_config {
    namespace_id = var.service_discovery_namespace_id
    
    dns_records {
      ttl  = 10
      type = "A"
    }
    
    routing_policy = "MULTIVALUE"
  }
  
  health_check_grace_period_seconds = 300
}
