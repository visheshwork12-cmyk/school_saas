# infrastructure/terraform/modules/backup/outputs.tf

# ================================
# BACKUP VAULT OUTPUTS
# ================================

output "backup_vault_arn" {
  description = "ARN of the primary backup vault"
  value       = aws_backup_vault.main.arn
}

output "backup_vault_name" {
  description = "Name of the primary backup vault"
  value       = aws_backup_vault.main.name
}

output "backup_vault_recovery_points" {
  description = "Number of recovery points in backup vault"
  value       = aws_backup_vault.main.recovery_points
}

output "cross_region_backup_vault_arn" {
  description = "ARN of the cross-region backup vault"
  value       = var.enable_cross_region_backup ? aws_backup_vault.cross_region[0].arn : null
}

# ================================
# BACKUP PLAN OUTPUTS
# ================================

output "backup_plan_id" {
  description = "ID of the backup plan"
  value       = aws_backup_plan.main.id
}

output "backup_plan_arn" {
  description = "ARN of the backup plan"
  value       = aws_backup_plan.main.arn
}

output "backup_plan_version" {
  description = "Version of the backup plan"
  value       = aws_backup_plan.main.version
}

# ================================
# S3 BACKUP STORAGE OUTPUTS
# ================================

output "primary_backup_bucket_name" {
  description = "Name of the primary backup S3 bucket"
  value       = aws_s3_bucket.primary_backup.bucket
}

output "primary_backup_bucket_arn" {
  description = "ARN of the primary backup S3 bucket"
  value       = aws_s3_bucket.primary_backup.arn
}

output "primary_backup_bucket_domain_name" {
  description = "Domain name of the primary backup S3 bucket"
  value       = aws_s3_bucket.primary_backup.bucket_domain_name
}

output "cross_region_backup_bucket_name" {
  description = "Name of the cross-region backup S3 bucket"
  value       = var.enable_cross_region_backup ? aws_s3_bucket.cross_region_backup[0].bucket : null
}

output "cross_region_backup_bucket_arn" {
  description = "ARN of the cross-region backup S3 bucket"
  value       = var.enable_cross_region_backup ? aws_s3_bucket.cross_region_backup[0].arn : null
}

# ================================
# KMS KEY OUTPUTS
# ================================

output "backup_kms_key_id" {
  description = "ID of the backup KMS key"
  value       = aws_kms_key.backup_key.key_id
}

output "backup_kms_key_arn" {
  description = "ARN of the backup KMS key"
  value       = aws_kms_key.backup_key.arn
}

output "backup_kms_key_alias" {
  description = "Alias of the backup KMS key"
  value       = aws_kms_alias.backup_key.name
}

output "cross_region_backup_kms_key_arn" {
  description = "ARN of the cross-region backup KMS key"
  value       = var.enable_cross_region_backup ? aws_kms_key.backup_key_cross_region[0].arn : null
}

# ================================
# IAM ROLE OUTPUTS
# ================================

output "backup_role_arn" {
  description = "ARN of the backup IAM role"
  value       = aws_iam_role.backup_role.arn
}

output "backup_role_name" {
  description = "Name of the backup IAM role"
  value       = aws_iam_role.backup_role.name
}

output "mongodb_backup_lambda_role_arn" {
  description = "ARN of the MongoDB backup Lambda IAM role"
  value       = var.enable_mongodb_backup ? aws_iam_role.mongodb_backup_lambda[0].arn : null
}

# ================================
# LAMBDA FUNCTION OUTPUTS
# ================================

output "mongodb_backup_lambda_function_name" {
  description = "Name of the MongoDB backup Lambda function"
  value       = var.enable_mongodb_backup ? aws_lambda_function.mongodb_backup[0].function_name : null
}

output "mongodb_backup_lambda_function_arn" {
  description = "ARN of the MongoDB backup Lambda function"
  value       = var.enable_mongodb_backup ? aws_lambda_function.mongodb_backup[0].arn : null
}

# ================================
# BACKUP SELECTION OUTPUTS
# ================================

output "rds_backup_selection_id" {
  description = "ID of the RDS backup selection"
  value       = length(var.rds_instance_arns) > 0 ? aws_backup_selection.rds[0].id : null
}

output "efs_backup_selection_id" {
  description = "ID of the EFS backup selection"
  value       = length(var.efs_file_system_arns) > 0 ? aws_backup_selection.efs[0].id : null
}

output "ebs_backup_selection_id" {
  description = "ID of the EBS backup selection"
  value       = length(var.ebs_volume_arns) > 0 ? aws_backup_selection.ebs[0].id : null
}

# ================================
# MONITORING OUTPUTS
# ================================

output "backup_notification_topic_arn" {
  description = "ARN of the backup notification SNS topic"
  value       = aws_sns_topic.backup_notifications.arn
}

output "backup_failure_alarm_name" {
  description = "Name of the backup failure CloudWatch alarm"
  value       = aws_cloudwatch_metric_alarm.backup_failure.alarm_name
}

output "backup_failure_alarm_arn" {
  description = "ARN of the backup failure CloudWatch alarm"
  value       = aws_cloudwatch_metric_alarm.backup_failure.arn
}

# ================================
# SCHEDULE OUTPUTS
# ================================

output "mongodb_backup_schedule_rule_name" {
  description = "Name of the MongoDB backup EventBridge rule"
  value       = var.enable_mongodb_backup ? aws_cloudwatch_event_rule.mongodb_backup_schedule[0].name : null
}

output "mongodb_backup_schedule_rule_arn" {
  description = "ARN of the MongoDB backup EventBridge rule"
  value       = var.enable_mongodb_backup ? aws_cloudwatch_event_rule.mongodb_backup_schedule[0].arn : null
}

# ================================
# CONFIGURATION SUMMARY
# ================================

output "backup_configuration_summary" {
  description = "Summary of backup configuration"
  value = {
    environment                = var.environment
    retention_days            = var.backup_retention_days
    cross_region_enabled      = var.enable_cross_region_backup
    cross_region_region       = var.cross_region_backup_region
    mongodb_backup_enabled    = var.enable_mongodb_backup
    monitoring_enabled        = var.enable_backup_monitoring
    notifications_enabled     = var.enable_backup_notifications
    backup_vault_name         = aws_backup_vault.main.name
    primary_backup_bucket     = aws_s3_bucket.primary_backup.bucket
    disaster_recovery_tier    = var.disaster_recovery_tier
    rto_hours                = var.recovery_time_objective_hours
    rpo_hours                = var.recovery_point_objective_hours
  }
}

# ================================
# COSTS AND OPTIMIZATION
# ================================

output "estimated_monthly_costs" {
  description = "Estimated monthly backup costs breakdown"
  value = {
    note = "Actual costs depend on data volume and usage patterns"
    backup_storage_gb_month = "Based on backup size and retention"
    lambda_invocations      = var.enable_mongodb_backup ? "Monthly MongoDB backup executions" : "N/A"
    cross_region_replication = var.enable_cross_region_backup ? "Additional storage and transfer costs" : "Disabled"
    kms_key_usage          = "KMS key usage for encryption"
  }
}

# ================================
# SECURITY INFORMATION
# ================================

output "security_configuration" {
  description = "Security configuration details"
  value = {
    encryption_at_rest     = "Enabled with KMS"
    encryption_in_transit  = "Enabled for all transfers"
    access_control        = "IAM roles and policies"
    audit_logging         = var.enable_backup_audit_logging
    vault_lock_enabled    = var.backup_vault_lock_configuration != null
    cross_region_security = var.enable_cross_region_backup ? "Separate KMS key per region" : "N/A"
  }
}

# ================================
# OPERATIONAL INFORMATION
# ================================

output "operational_details" {
  description = "Operational details for backup management"
  value = {
    backup_window_start     = "${var.backup_window_start_hour}:00 UTC"
    daily_backup_schedule   = "cron(0 2 * * ? *)"
    weekly_backup_schedule  = "cron(0 3 ? * SUN *)"
    monthly_backup_schedule = "cron(0 4 1 * ? *)"
    mongodb_backup_schedule = var.enable_mongodb_backup ? var.mongodb_backup_schedule : "Disabled"
    notification_topic      = aws_sns_topic.backup_notifications.name
    monitoring_alarms       = ["backup_failure"]
  }
}
