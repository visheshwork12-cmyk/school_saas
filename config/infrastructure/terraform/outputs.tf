# config/infrastructure/terraform/outputs.tf
# ECS Auto Scaling Outputs

# ECS Service Information
output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = module.ecs_service.service_name
}

output "ecs_service_arn" {
  description = "ARN of the ECS service"
  value       = module.ecs_service.service_arn
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

# Auto Scaling Information
output "autoscaling_target_resource_id" {
  description = "Resource ID of the auto scaling target"
  value       = module.ecs_service.autoscaling_target_resource_id
}

output "cpu_scaling_policy_arn" {
  description = "ARN of the CPU scaling policy"
  value       = module.ecs_service.cpu_scaling_policy_arn
}

output "memory_scaling_policy_arn" {
  description = "ARN of the memory scaling policy"
  value       = module.ecs_service.memory_scaling_policy_arn
}

# CloudWatch Alarms
output "high_cpu_alarm_arn" {
  description = "ARN of the high CPU alarm"
  value       = module.ecs_service.high_cpu_alarm_arn
}

output "low_cpu_alarm_arn" {
  description = "ARN of the low CPU alarm"
  value       = module.ecs_service.low_cpu_alarm_arn
}

output "high_memory_alarm_arn" {
  description = "ARN of the high memory alarm"
  value       = module.ecs_service.high_memory_alarm_arn
}

# Scaling Configuration Summary
output "scaling_configuration" {
  description = "Summary of scaling configuration"
  value = {
    min_capacity        = local.scaling_config.min_capacity
    max_capacity        = local.scaling_config.max_capacity
    cpu_target_value    = local.scaling_config.cpu_target
    memory_target_value = local.scaling_config.memory_target
    environment         = var.environment
  }
}

# Service Discovery
output "service_discovery_service_arn" {
  description = "ARN of the service discovery service"
  value       = module.ecs_service.service_discovery_service_arn
  sensitive   = false
}

# Load Balancer Integration
output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.ecs_service.arn
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

# Monitoring URLs
output "cloudwatch_dashboard_url" {
  description = "URL to the CloudWatch dashboard"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${var.project_name}-${var.environment}-ecs-metrics"
}

output "ecs_service_url" {
  description = "URL to the ECS service in AWS console"
  value       = "https://console.aws.amazon.com/ecs/home?region=${var.region}#/clusters/${aws_ecs_cluster.main.name}/services/${module.ecs_service.service_name}/details"
}
