# infrastructure/terraform/modules/elasticache/main.tf
terraform {
  required_version = ">= 1.0"
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
data "aws_availability_zones" "available" {
  state = "available"
}

# Local values for resource naming and configuration
locals {
  cluster_id = "${var.name_prefix}-redis"
  
  # Environment-specific configurations
  environment_config = {
    development = {
      node_type              = "cache.t3.micro"
      num_cache_nodes        = 1
      automatic_failover     = false
      multi_az_enabled      = false
      snapshot_retention    = 1
      apply_immediately     = true
    }
    staging = {
      node_type              = "cache.t3.small"
      num_cache_nodes        = 2
      automatic_failover     = false
      multi_az_enabled      = false
      snapshot_retention    = 3
      apply_immediately     = false
    }
    production = {
      node_type              = "cache.r6g.large"
      num_cache_nodes        = 3
      automatic_failover     = true
      multi_az_enabled      = true
      snapshot_retention    = 7
      apply_immediately     = false
    }
  }
  
  config = local.environment_config[var.environment]
  
  # Use variable values if provided, otherwise use environment defaults
  final_node_type = var.node_type != null ? var.node_type : local.config.node_type
  final_num_cache_nodes = var.num_cache_nodes != null ? var.num_cache_nodes : local.config.num_cache_nodes
  final_automatic_failover = var.automatic_failover_enabled != null ? var.automatic_failover_enabled : local.config.automatic_failover
  final_multi_az = var.multi_az_enabled != null ? var.multi_az_enabled : local.config.multi_az_enabled
  final_snapshot_retention = var.snapshot_retention_limit != null ? var.snapshot_retention_limit : local.config.snapshot_retention
  
  common_tags = merge(var.tags, {
    Module      = "elasticache-redis"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.cluster_id}-subnet-group"
  subnet_ids = var.subnet_ids
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_id}-subnet-group"
  })
}

# ElastiCache Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  count = var.create_parameter_group ? 1 : 0
  
  family = var.parameter_group_family
  name   = "${local.cluster_id}-params"
  
  description = "ElastiCache parameter group for ${local.cluster_id}"
  
  # Redis configuration parameters
  dynamic "parameter" {
    for_each = var.parameter_group_parameters
    content {
      name  = parameter.value.name
      value = parameter.value.value
    }
  }
  
  # Default parameters for performance optimization
  parameter {
    name  = "maxmemory-policy"
    value = var.maxmemory_policy
  }
  
  parameter {
    name  = "timeout"
    value = var.timeout
  }
  
  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }
  
  tags = local.common_tags
  
  lifecycle {
    create_before_destroy = true
  }
}

# ElastiCache Replication Group (Redis Cluster)
resource "aws_elasticache_replication_group" "main" {
  replication_group_id         = local.cluster_id
  description                  = "Redis cluster for ${var.name_prefix} ${var.environment}"
  
  # Node configuration
  node_type                    = local.final_node_type
  port                        = var.port
  
  # Parameter group
  parameter_group_name = var.create_parameter_group ? aws_elasticache_parameter_group.main[0].name : var.parameter_group_name
  
  # Cluster configuration
  num_cache_clusters         = local.final_num_cache_nodes
  automatic_failover_enabled = local.final_automatic_failover
  multi_az_enabled          = local.final_multi_az
  
  # Engine configuration
  engine               = "redis"
  engine_version       = var.engine_version
  
  # Network configuration
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = var.security_group_ids
  
  # Backup configuration
  snapshot_retention_limit = local.final_snapshot_retention
  snapshot_window         = var.snapshot_window
  maintenance_window      = var.maintenance_window
  final_snapshot_identifier = var.create_final_snapshot ? "${local.cluster_id}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  
  # Encryption
  at_rest_encryption_enabled = var.at_rest_encryption_enabled
  transit_encryption_enabled = var.transit_encryption_enabled
  auth_token                = var.auth_token_enabled ? var.auth_token : null
  
  # Notifications
  notification_topic_arn = var.notification_topic_arn
  
  # Apply changes immediately in dev, during maintenance window in prod
  apply_immediately = var.apply_immediately != null ? var.apply_immediately : local.config.apply_immediately
  
  # Auto minor version upgrade
  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  
  # Data tiering (for r6gd instance types)
  data_tiering_enabled = var.data_tiering_enabled
  
  # Logging
  dynamic "log_delivery_configuration" {
    for_each = var.log_delivery_configuration
    content {
      destination      = log_delivery_configuration.value.destination
      destination_type = log_delivery_configuration.value.destination_type
      log_format       = log_delivery_configuration.value.log_format
      log_type         = log_delivery_configuration.value.log_type
    }
  }
  
  tags = merge(local.common_tags, {
    Name = local.cluster_id
  })
  
  depends_on = [aws_elasticache_subnet_group.main]
  
  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      num_cache_clusters, # Allow external scaling
    ]
  }
}

# CloudWatch Log Groups for Redis logs (if logging is enabled)
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  count = var.enable_slow_log ? 1 : 0
  
  name              = "/aws/elasticache/redis/${local.cluster_id}/slow-log"
  retention_in_days = var.log_retention_in_days
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_id}-slow-log"
    Type = "redis-slow-log"
  })
}

# CloudWatch Alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  count = var.enable_cloudwatch_alarms ? 1 : 0
  
  alarm_name          = "${local.cluster_id}-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.cpu_utilization_threshold
  alarm_description   = "This metric monitors ElastiCache CPU utilization"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  
  dimensions = {
    CacheClusterId = local.cluster_id
  }
  
  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "memory_utilization" {
  count = var.enable_cloudwatch_alarms ? 1 : 0
  
  alarm_name          = "${local.cluster_id}-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.memory_utilization_threshold
  alarm_description   = "This metric monitors ElastiCache memory utilization"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  
  dimensions = {
    CacheClusterId = local.cluster_id
  }
  
  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "connection_count" {
  count = var.enable_cloudwatch_alarms ? 1 : 0
  
  alarm_name          = "${local.cluster_id}-connection-count"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.connection_count_threshold
  alarm_description   = "This metric monitors ElastiCache connection count"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  
  dimensions = {
    CacheClusterId = local.cluster_id
  }
  
  tags = local.common_tags
}

# Route53 private hosted zone record for easy access
resource "aws_route53_record" "redis" {
  count = var.create_route53_record ? 1 : 0
  
  zone_id = var.route53_zone_id
  name    = "redis.${var.domain_name}"
  type    = "CNAME"
  ttl     = "300"
  records = [aws_elasticache_replication_group.main.configuration_endpoint_address != "" ? aws_elasticache_replication_group.main.configuration_endpoint_address : aws_elasticache_replication_group.main.primary_endpoint_address]
}
