# infrastructure/terraform/modules/elasticache/outputs.tf

# Primary outputs
output "cluster_id" {
  description = "ElastiCache replication group ID"
  value       = aws_elasticache_replication_group.main.replication_group_id
}

output "replication_group_id" {
  description = "ElastiCache replication group ID (alias for cluster_id)"
  value       = aws_elasticache_replication_group.main.replication_group_id
}

# Connection endpoints
output "primary_endpoint_address" {
  description = "Address of the endpoint for the primary node in the replication group"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "configuration_endpoint_address" {
  description = "Address of the replication group configuration endpoint when cluster mode is enabled"
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address
}

output "reader_endpoint_address" {
  description = "Address of the endpoint for the reader node in the replication group"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

# Legacy output names for backward compatibility
output "endpoint" {
  description = "Redis primary endpoint (legacy name)"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

# Port information
output "port" {
  description = "Redis port"
  value       = aws_elasticache_replication_group.main.port
}

# Member clusters
output "member_clusters" {
  description = "Identifiers of all the nodes that are part of this replication group"
  value       = aws_elasticache_replication_group.main.member_clusters
}

# Network information
output "subnet_group_name" {
  description = "Name of the ElastiCache subnet group"
  value       = aws_elasticache_subnet_group.main.name
}

output "subnet_group_id" {
  description = "ID of the ElastiCache subnet group"
  value       = aws_elasticache_subnet_group.main.id
}

output "security_group_ids" {
  description = "List of security group IDs associated with the ElastiCache cluster"
  value       = var.security_group_ids
}

# Parameter group information
output "parameter_group_name" {
  description = "Name of the parameter group"
  value       = var.create_parameter_group ? aws_elasticache_parameter_group.main[0].name : var.parameter_group_name
}

output "parameter_group_id" {
  description = "ID of the parameter group"
  value       = var.create_parameter_group ? aws_elasticache_parameter_group.main[0].id : null
}

# Configuration information
output "engine" {
  description = "Redis engine"
  value       = aws_elasticache_replication_group.main.engine
}

output "engine_version" {
  description = "Redis engine version"
  value       = aws_elasticache_replication_group.main.engine_version_actual
}

output "node_type" {
  description = "Instance type of the Redis nodes"
  value       = aws_elasticache_replication_group.main.node_type
}

output "num_cache_clusters" {
  description = "Number of cache clusters (nodes) in the replication group"
  value       = aws_elasticache_replication_group.main.num_cache_clusters
}

# High availability information
output "automatic_failover_enabled" {
  description = "Whether automatic failover is enabled"
  value       = aws_elasticache_replication_group.main.automatic_failover_enabled
}

output "multi_az_enabled" {
  description = "Whether Multi-AZ is enabled"
  value       = aws_elasticache_replication_group.main.multi_az_enabled
}

# Backup information
output "snapshot_retention_limit" {
  description = "Number of days snapshots are retained"
  value       = aws_elasticache_replication_group.main.snapshot_retention_limit
}

output "snapshot_window" {
  description = "Daily time range for snapshots"
  value       = aws_elasticache_replication_group.main.snapshot_window
}

output "maintenance_window" {
  description = "Weekly time range for maintenance"
  value       = aws_elasticache_replication_group.main.maintenance_window
}

# Security information
output "at_rest_encryption_enabled" {
  description = "Whether encryption at rest is enabled"
  value       = aws_elasticache_replication_group.main.at_rest_encryption_enabled
}

output "transit_encryption_enabled" {
  description = "Whether encryption in transit is enabled"
  value       = aws_elasticache_replication_group.main.transit_encryption_enabled
}

output "auth_token_enabled" {
  description = "Whether Redis AUTH is enabled"
  value       = aws_elasticache_replication_group.main.auth_token_enabled
  sensitive   = true
}

# ARN
output "arn" {
  description = "ARN of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.main.arn
}

# CloudWatch Log Groups
output "slow_log_group_name" {
  description = "Name of the slow log CloudWatch log group"
  value       = var.enable_slow_log ? aws_cloudwatch_log_group.redis_slow_log[0].name : null
}

output "slow_log_group_arn" {
  description = "ARN of the slow log CloudWatch log group"
  value       = var.enable_slow_log ? aws_cloudwatch_log_group.redis_slow_log[0].arn : null
}

# CloudWatch Alarms
output "cpu_alarm_name" {
  description = "Name of the CPU utilization CloudWatch alarm"
  value       = var.enable_cloudwatch_alarms ? aws_cloudwatch_metric_alarm.cpu_utilization[0].alarm_name : null
}

output "memory_alarm_name" {
  description = "Name of the memory utilization CloudWatch alarm"
  value       = var.enable_cloudwatch_alarms ? aws_cloudwatch_metric_alarm.memory_utilization[0].alarm_name : null
}

output "connection_alarm_name" {
  description = "Name of the connection count CloudWatch alarm"
  value       = var.enable_cloudwatch_alarms ? aws_cloudwatch_metric_alarm.connection_count[0].alarm_name : null
}

# DNS
output "route53_record_name" {
  description = "Name of the Route53 record"
  value       = var.create_route53_record ? aws_route53_record.redis[0].name : null
}

output "route53_record_fqdn" {
  description = "FQDN of the Route53 record"
  value       = var.create_route53_record ? aws_route53_record.redis[0].fqdn : null
}

# Connection information for applications
output "connection_info" {
  description = "Redis connection information"
  value = {
    host                     = aws_elasticache_replication_group.main.primary_endpoint_address
    port                     = aws_elasticache_replication_group.main.port
    configuration_endpoint  = aws_elasticache_replication_group.main.configuration_endpoint_address
    reader_endpoint         = aws_elasticache_replication_group.main.reader_endpoint_address
    auth_token_enabled      = aws_elasticache_replication_group.main.auth_token_enabled
    transit_encryption      = aws_elasticache_replication_group.main.transit_encryption_enabled
    at_rest_encryption      = aws_elasticache_replication_group.main.at_rest_encryption_enabled
  }
  sensitive = true
}

# Tags
output "tags" {
  description = "Tags applied to the ElastiCache resources"
  value       = aws_elasticache_replication_group.main.tags_all
}
