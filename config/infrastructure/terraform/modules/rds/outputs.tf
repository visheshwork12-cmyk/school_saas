# infrastructure/terraform/modules/rds/outputs.tf

# Primary Instance Outputs
output "instance_id" {
  description = "RDS instance ID"
  value       = aws_db_instance.main.id
}

output "instance_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.main.arn
}

output "endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}

output "username" {
  description = "Master username"
  value       = aws_db_instance.main.username
  sensitive   = true
}

output "password" {
  description = "Master password"
  value       = var.password != null ? var.password : random_password.master_password[0].result
  sensitive   = true
}

# Connection Information
output "connection_string" {
  description = "Database connection string"
  value = format("%s://%s:%s@%s:%s/%s",
    var.engine,
    aws_db_instance.main.username,
    var.password != null ? var.password : random_password.master_password[0].result,
    aws_db_instance.main.endpoint,
    aws_db_instance.main.port,
    aws_db_instance.main.db_name
  )
  sensitive = true
}

# Read Replicas
output "read_replica_endpoints" {
  description = "Read replica endpoints"
  value = var.create_read_replica ? [
    for replica in aws_db_instance.read_replica : replica.endpoint
  ] : []
}

output "read_replica_ids" {
  description = "Read replica instance IDs"
  value = var.create_read_replica ? [
    for replica in aws_db_instance.read_replica : replica.id
  ] : []
}

# Subnet Group
output "subnet_group_name" {
  description = "DB subnet group name"
  value       = aws_db_subnet_group.main.name
}

output "subnet_group_arn" {
  description = "DB subnet group ARN"
  value       = aws_db_subnet_group.main.arn
}

# Parameter Group
output "parameter_group_name" {
  description = "DB parameter group name"
  value       = aws_db_parameter_group.main.name
}

output "parameter_group_arn" {
  description = "DB parameter group ARN"
  value       = aws_db_parameter_group.main.arn
}

# Option Group (if created)
output "option_group_name" {
  description = "DB option group name"
  value       = var.create_option_group ? aws_db_option_group.main[0].name : null
}

output "option_group_arn" {
  description = "DB option group ARN"
  value       = var.create_option_group ? aws_db_option_group.main[0].arn : null
}

# KMS Key (if created)
output "kms_key_id" {
  description = "KMS key ID for RDS encryption"
  value       = var.create_kms_key ? aws_kms_key.rds[0].key_id : null
}

output "kms_key_arn" {
  description = "KMS key ARN for RDS encryption"
  value       = var.create_kms_key ? aws_kms_key.rds[0].arn : null
}

# CloudWatch Log Groups
output "cloudwatch_log_groups" {
  description = "CloudWatch log group names"
  value = {
    for log_type in var.enabled_cloudwatch_logs_exports :
    log_type => aws_cloudwatch_log_group.rds_logs[log_type].name
  }
}

# SSM Parameters (if created)
output "ssm_parameters" {
  description = "SSM parameter names for database connection"
  value = var.store_credentials_in_ssm ? {
    endpoint          = aws_ssm_parameter.db_endpoint[0].name
    port             = aws_ssm_parameter.db_port[0].name
    database_name    = aws_ssm_parameter.db_name[0].name
    username         = aws_ssm_parameter.db_username[0].name
    password         = aws_ssm_parameter.db_password[0].name
    connection_string = aws_ssm_parameter.connection_string[0].name
  } : {}
}

# Instance Details
output "instance_class" {
  description = "RDS instance class"
  value       = aws_db_instance.main.instance_class
}

output "engine" {
  description = "Database engine"
  value       = aws_db_instance.main.engine
}

output "engine_version" {
  description = "Database engine version"
  value       = aws_db_instance.main.engine_version
}

output "allocated_storage" {
  description = "Allocated storage in GB"
  value       = aws_db_instance.main.allocated_storage
}

output "storage_encrypted" {
  description = "Whether storage is encrypted"
  value       = aws_db_instance.main.storage_encrypted
}

output "multi_az" {
  description = "Whether Multi-AZ is enabled"
  value       = aws_db_instance.main.multi_az
}

output "backup_retention_period" {
  description = "Backup retention period"
  value       = aws_db_instance.main.backup_retention_period
}

output "backup_window" {
  description = "Backup window"
  value       = aws_db_instance.main.backup_window
}

output "maintenance_window" {
  description = "Maintenance window"
  value       = aws_db_instance.main.maintenance_window
}

# Performance Insights
output "performance_insights_enabled" {
  description = "Whether Performance Insights is enabled"
  value       = aws_db_instance.main.performance_insights_enabled
}

# Monitoring
output "monitoring_interval" {
  description = "Enhanced monitoring interval"
  value       = aws_db_instance.main.monitoring_interval
}

# Security Groups
output "vpc_security_group_ids" {
  description = "VPC security group IDs"
  value       = aws_db_instance.main.vpc_security_group_ids
}

# Availability Zone
output "availability_zone" {
  description = "Availability zone"
  value       = aws_db_instance.main.availability_zone
}

# Resource ID for monitoring/tagging
output "resource_id" {
  description = "RDS resource ID"
  value       = aws_db_instance.main.resource_id
}
