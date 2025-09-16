# infrastructure/terraform/modules/ecr/outputs.tf
# Output values for ECR module

# Repository Information
output "repository_arns" {
  description = "ARNs of the ECR repositories"
  value = {
    for name, repo in aws_ecr_repository.repositories : name => repo.arn
  }
}

output "repository_urls" {
  description = "URLs of the ECR repositories"
  value = {
    for name, repo in aws_ecr_repository.repositories : name => repo.repository_url
  }
}

output "repository_names" {
  description = "Names of the ECR repositories"
  value = {
    for name, repo in aws_ecr_repository.repositories : name => repo.name
  }
}

output "repository_registry_ids" {
  description = "Registry IDs of the ECR repositories"
  value = {
    for name, repo in aws_ecr_repository.repositories : name => repo.registry_id
  }
}

# Main application repository outputs (commonly used)
output "api_repository_url" {
  description = "URL of the main API repository"
  value       = aws_ecr_repository.repositories["${var.name_prefix}-api"].repository_url
}

output "api_repository_arn" {
  description = "ARN of the main API repository"
  value       = aws_ecr_repository.repositories["${var.name_prefix}-api"].arn
}

output "worker_repository_url" {
  description = "URL of the worker repository"
  value       = aws_ecr_repository.repositories["${var.name_prefix}-worker"].repository_url
}

output "migration_repository_url" {
  description = "URL of the migration repository"
  value       = aws_ecr_repository.repositories["${var.name_prefix}-migration"].repository_url
}

# Registry Information
output "registry_id" {
  description = "ECR registry ID"
  value       = data.aws_caller_identity.current.account_id
}

output "registry_url" {
  description = "ECR registry URL"
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com"
}

# Encryption
output "kms_key_id" {
  description = "KMS key ID for ECR encryption"
  value       = var.enable_encryption ? aws_kms_key.ecr[0].key_id : null
}

output "kms_key_arn" {
  description = "KMS key ARN for ECR encryption"
  value       = var.enable_encryption ? aws_kms_key.ecr[0].arn : null
}

output "kms_alias_name" {
  description = "KMS key alias name"
  value       = var.enable_encryption ? aws_kms_alias.ecr[0].name : null
}

# Replication
output "replication_enabled" {
  description = "Whether cross-region replication is enabled"
  value       = var.enable_cross_region_replication
}

output "replication_destination" {
  description = "Replication destination region"
  value       = var.enable_cross_region_replication ? var.replication_region : null
}

# Monitoring
output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for ECR"
  value       = aws_cloudwatch_log_group.ecr.name
}

output "cloudwatch_log_group_arn" {
  description = "CloudWatch log group ARN for ECR"
  value       = aws_cloudwatch_log_group.ecr.arn
}

# Scanning Configuration
output "scanning_configuration" {
  description = "ECR scanning configuration"
  value = {
    scan_type        = aws_ecr_registry_scanning_configuration.scanning.scan_type
    enhanced_enabled = var.enhanced_scanning
  }
  sensitive = false
}

# Docker Login Command (for reference)
output "docker_login_command" {
  description = "AWS CLI command to login to ECR"
  value       = "aws ecr get-login-password --region ${data.aws_region.current.name} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com"
  sensitive   = true
}

# Repository Count
output "total_repositories" {
  description = "Total number of repositories created"
  value       = length(aws_ecr_repository.repositories)
}

# Tagging Information
output "common_tags" {
  description = "Common tags applied to all resources"
  value       = local.common_tags
}
