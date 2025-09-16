# config/infrastructure/terraform/modules/ecs/autoscaling.tf
# Complete ECS Auto Scaling Setup with Target Tracking

# Application Auto Scaling Target
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.school_erp_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-autoscaling-target"
    Environment = var.environment
    Project     = var.project_name
    Component   = "autoscaling"
  }
}

# CPU Utilization Auto Scaling Policy (Target Tracking)
resource "aws_appautoscaling_policy" "ecs_cpu_policy" {
  name               = "${var.project_name}-${var.environment}-cpu-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    
    target_value       = var.cpu_target_value
    scale_out_cooldown = var.scale_out_cooldown
    scale_in_cooldown  = var.scale_in_cooldown
    disable_scale_in   = false
  }
}

# Memory Utilization Auto Scaling Policy (Target Tracking)
resource "aws_appautoscaling_policy" "ecs_memory_policy" {
  name               = "${var.project_name}-${var.environment}-memory-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    
    target_value       = var.memory_target_value
    scale_out_cooldown = var.scale_out_cooldown
    scale_in_cooldown  = var.scale_in_cooldown
    disable_scale_in   = false
  }
}

# Custom Application Load Balancer Request Count Scaling Policy
resource "aws_appautoscaling_policy" "ecs_alb_request_policy" {
  name               = "${var.project_name}-${var.environment}-alb-request-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label        = "${var.alb_full_name}/${var.target_group_full_name}"
    }
    
    target_value       = var.request_count_target_value
    scale_out_cooldown = var.scale_out_cooldown
    scale_in_cooldown  = var.scale_in_cooldown
    disable_scale_in   = false
  }
}

# Step Scaling Policy for Emergency Scale Out (High CPU)
resource "aws_appautoscaling_policy" "ecs_emergency_scale_out" {
  name               = "${var.project_name}-${var.environment}-emergency-scale-out"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace
  
  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown               = 300
    metric_aggregation_type = "Average"
    
    step_adjustment {
      metric_interval_lower_bound = 0
      metric_interval_upper_bound = 50
      scaling_adjustment         = 2
    }
    
    step_adjustment {
      metric_interval_lower_bound = 50
      scaling_adjustment         = 4
    }
  }
}

# Step Scaling Policy for Scale In (Low CPU)
resource "aws_appautoscaling_policy" "ecs_scale_in" {
  name               = "${var.project_name}-${var.environment}-scale-in"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace
  
  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown               = 600
    metric_aggregation_type = "Average"
    
    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment         = -1
    }
  }
}
