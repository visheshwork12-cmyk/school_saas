# config/infrastructure/terraform/modules/secrets/outputs.tf

# Database Secrets Outputs
output "database_secret_arns" {
  description = "ARNs of database secrets"
  value       = { for k, v in aws_secretsmanager_secret.database_secrets : k => v.arn }
}

output "database_secret_ids" {
  description = "IDs of database secrets"
  value       = { for k, v in aws_secretsmanager_secret.database_secrets : k => v.id }
}

output "database_secret_names" {
  description = "Names of database secrets"
  value       = { for k, v in aws_secretsmanager_secret.database_secrets : k => v.name }
}

# API Secrets Outputs
output "api_secret_arns" {
  description = "ARNs of API secrets"
  value       = { for k, v in aws_secretsmanager_secret.api_secrets : k => v.arn }
}

output "api_secret_ids" {
  description = "IDs of API secrets"
  value       = { for k, v in aws_secretsmanager_secret.api_secrets : k => v.id }
}

output "api_secret_names" {
  description = "Names of API secrets"
  value       = { for k, v in aws_secretsmanager_secret.api_secrets : k => v.name }
}

# Service Secrets Outputs
output "service_secret_arns" {
  description = "ARNs of service secrets"
  value       = { for k, v in aws_secretsmanager_secret.service_secrets : k => v.arn }
}

output "service_secret_ids" {
  description = "IDs of service secrets"
  value       = { for k, v in aws_secretsmanager_secret.service_secrets : k => v.id }
}

output "service_secret_names" {
  description = "Names of service secrets"
  value       = { for k, v in aws_secretsmanager_secret.service_secrets : k => v.name }
}

# Combined Outputs
output "all_secret_arns" {
  description = "All secret ARNs"
  value = merge(
    { for k, v in aws_secretsmanager_secret.database_secrets : "database/${k}" => v.arn },
    { for k, v in aws_secretsmanager_secret.api_secrets : "api/${k}" => v.arn },
    { for k, v in aws_secretsmanager_secret.service_secrets : "service/${k}" => v.arn }
  )
}

output "all_secret_names" {
  description = "All secret names"
  value = merge(
    { for k, v in aws_secretsmanager_secret.database_secrets : "database/${k}" => v.name },
    { for k, v in aws_secretsmanager_secret.api_secrets : "api/${k}" => v.name },
    { for k, v in aws_secretsmanager_secret.service_secrets : "service/${k}" => v.name }
  )
}

# IAM Policy Output
output "secrets_access_policy_arn" {
  description = "ARN of the secrets access IAM policy"
  value       = var.create_access_policy ? aws_iam_policy.secrets_access[0].arn : null
}

output "secrets_access_policy_name" {
  description = "Name of the secrets access IAM policy"
  value       = var.create_access_policy ? aws_iam_policy.secrets_access[0].name : null
}

# CloudWatch Log Group
output "rotation_log_group_name" {
  description = "Name of the rotation CloudWatch log group"
  value       = var.enable_rotation_logs ? aws_cloudwatch_log_group.rotation_logs[0].name : null
}

output "rotation_log_group_arn" {
  description = "ARN of the rotation CloudWatch log group"
  value       = var.enable_rotation_logs ? aws_cloudwatch_log_group.rotation_logs[0].arn : null
}

# For convenience - frequently used secrets
output "main_database_secret_arn" {
  description = "ARN of the main database secret"
  value       = try(aws_secretsmanager_secret.database_secrets["main"].arn, null)
}

output "redis_secret_arn" {
  description = "ARN of the Redis secret"
  value       = try(aws_secretsmanager_secret.database_secrets["redis"].arn, null)
}

output "jwt_secret_arn" {
  description = "ARN of the JWT secret"
  value       = try(aws_secretsmanager_secret.api_secrets["jwt"].arn, null)
}
