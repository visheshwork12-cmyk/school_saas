# ECS Cluster Outputs
output "cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.school_erp_cluster.id
}

output "cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.school_erp_cluster.name
}

output "cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.school_erp_cluster.arn
}

# ECS Service Outputs
output "service_id" {
  description = "ID of the ECS service"
  value       = aws_ecs_service.school_erp_service.id
}

output "service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.school_erp_service.name
}

output "service_arn" {
  description = "ARN of the ECS service"
  value       = aws_ecs_service.school_erp_service.id
}

# Task Definition Outputs
output "task_definition_arn" {
  description = "ARN of the task definition"
  value       = aws_ecs_task_definition.school_erp_api.arn
}

output "task_definition_family" {
  description = "Family of the task definition"
  value       = aws_ecs_task_definition.school_erp_api.family
}

output "task_definition_revision" {
  description = "Revision of the task definition"
  value       = aws_ecs_task_definition.school_erp_api.revision
}

# Load Balancer Outputs
output "load_balancer_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.school_erp_alb.arn
}

output "load_balancer_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.school_erp_alb.dns_name
}

output "load_balancer_zone_id" {
  description = "Hosted zone ID of the Application Load Balancer"
  value       = aws_lb.school_erp_alb.zone_id
}

output "load_balancer_url" {
  description = "URL of the Application Load Balancer"
  value       = "https://${aws_lb.school_erp_alb.dns_name}"
}

# Target Group Outputs
output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.api_tg.arn
}

output "target_group_name" {
  description = "Name of the target group"
  value       = aws_lb_target_group.api_tg.name
}

# Security Group Outputs
output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb_sg.id
}

output "ecs_security_group_id" {
  description = "ID of the ECS tasks security group"
  value       = aws_security_group.ecs_tasks_sg.id
}

# IAM Role Outputs
output "ecs_execution_role_arn" {
  description = "ARN of the ECS execution role"
  value       = aws_iam_role.ecs_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task_role.arn
}

# CloudWatch Log Group Outputs
output "log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.ecs_logs.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.ecs_logs.arn
}

# Service Discovery Outputs
output "service_discovery_namespace_id" {
  description = "ID of the service discovery namespace"
  value       = aws_service_discovery_private_dns_namespace.school_erp_namespace.id
}

output "service_discovery_namespace_arn" {
  description = "ARN of the service discovery namespace"
  value       = aws_service_discovery_private_dns_namespace.school_erp_namespace.arn
}

output "service_discovery_service_id" {
  description = "ID of the service discovery service"
  value       = aws_service_discovery_service.school_erp_discovery.id
}

output "service_discovery_service_arn" {
  description = "ARN of the service discovery service"
  value       = aws_service_discovery_service.school_erp_discovery.arn
}

# Auto Scaling Outputs
output "autoscaling_target_resource_id" {
  description = "Resource ID of the auto scaling target"
  value       = aws_appautoscaling_target.ecs_target.resource_id
}

output "cpu_scaling_policy_arn" {
  description = "ARN of the CPU scaling policy"
  value       = aws_appautoscaling_policy.ecs_cpu_scaling_policy.arn
}

output "memory_scaling_policy_arn" {
  description = "ARN of the memory scaling policy"
  value       = aws_appautoscaling_policy.ecs_memory_scaling_policy.arn
}

# CloudWatch Alarms Outputs
output "high_cpu_alarm_arn" {
  description = "ARN of the high CPU alarm"
  value       = aws_cloudwatch_metric_alarm.high_cpu.arn
}

output "high_memory_alarm_arn" {
  description = "ARN of the high memory alarm"
  value       = aws_cloudwatch_metric_alarm.high_memory.arn
}

# Application Configuration Outputs
output "application_url" {
  description = "Main application URL"
  value       = var.ssl_certificate_arn != "" ? "https://${aws_lb.school_erp_alb.dns_name}" : "http://${aws_lb.school_erp_alb.dns_name}"
}

output "health_check_url" {
  description = "Health check URL"
  value       = "${var.ssl_certificate_arn != "" ? "https" : "http"}://${aws_lb.school_erp_alb.dns_name}${var.health_check_path}"
}

output "api_docs_url" {
  description = "API documentation URL"
  value       = "${var.ssl_certificate_arn != "" ? "https" : "http"}://${aws_lb.school_erp_alb.dns_name}/api-docs"
}

# Environment Information
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "project_name" {
  description = "Project name"
  value       = var.project_name
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

# Resource Summary
output "resource_summary" {
  description = "Summary of created resources"
  value = {
    cluster_name                  = aws_ecs_cluster.school_erp_cluster.name
    service_name                 = aws_ecs_service.school_erp_service.name
    load_balancer_dns           = aws_lb.school_erp_alb.dns_name
    desired_count               = var.desired_count
    min_capacity                = var.min_capacity
    max_capacity                = var.max_capacity
    task_cpu                    = var.task_cpu
    task_memory                 = var.task_memory
    container_port              = var.container_port
    environment                 = var.environment
    enable_container_insights   = var.enable_container_insights
    enable_auto_scaling         = var.enable_auto_scaling
    enable_service_discovery    = var.enable_service_discovery
  }
}

# Connection Information
output "connection_info" {
  description = "Connection information for other services"
  value = {
    internal_dns_name = "${aws_service_discovery_service.school_erp_discovery.name}.${aws_service_discovery_private_dns_namespace.school_erp_namespace.name}"
    container_port    = var.container_port
    vpc_id           = var.vpc_id
    security_group_id = aws_security_group.ecs_tasks_sg.id
  }
}

# Deployment Information
output "deployment_info" {
  description = "Information needed for deployment automation"
  value = {
    cluster_name           = aws_ecs_cluster.school_erp_cluster.name
    service_name          = aws_ecs_service.school_erp_service.name
    task_definition_family = aws_ecs_task_definition.school_erp_api.family
    container_name        = "school-erp-api"
    log_group_name        = aws_cloudwatch_log_group.ecs_logs.name
  }
}
