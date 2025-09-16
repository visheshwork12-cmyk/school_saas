# infrastructure/terraform/modules/rds/main.tf
# RDS Module for School ERP SaaS - Production Ready

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.1"
    }
  }
  required_version = ">= 1.6.0"
}

# Local values for better organization
locals {
  common_tags = merge(var.tags, {
    Name        = "${var.name_prefix}-rds"
    Component   = "database"
    Module      = "rds"
    Environment = var.environment
  })

  # Database configuration based on environment
  db_config = {
    development = {
      instance_class          = "db.t3.micro"
      allocated_storage      = 20
      max_allocated_storage  = 100
      backup_retention_period = 7
      multi_az              = false
      deletion_protection   = false
      performance_insights  = false
    }
    staging = {
      instance_class          = "db.t3.small"
      allocated_storage      = 100
      max_allocated_storage  = 200
      backup_retention_period = 14
      multi_az              = false
      deletion_protection   = true
      performance_insights  = true
    }
    production = {
      instance_class          = "db.r6g.large"
      allocated_storage      = 500
      max_allocated_storage  = 1000
      backup_retention_period = 30
      multi_az              = true
      deletion_protection   = true
      performance_insights  = true
    }
  }

  final_config = local.db_config[var.environment]
}

# Random password for master user
resource "random_password" "master_password" {
  count   = var.password == null ? 1 : 0
  length  = 32
  special = true

  # Exclude problematic characters
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# KMS key for RDS encryption
resource "aws_kms_key" "rds" {
  count = var.create_kms_key ? 1 : 0

  description             = "KMS key for RDS encryption - ${var.name_prefix}"
  deletion_window_in_days = var.kms_key_deletion_window
  enable_key_rotation     = true

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-rds-kms"
  })
}

resource "aws_kms_alias" "rds" {
  count = var.create_kms_key ? 1 : 0

  name          = "alias/${var.name_prefix}-rds"
  target_key_id = aws_kms_key.rds[0].key_id
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-db-subnet-group"
  })
}

# DB Parameter Group
resource "aws_db_parameter_group" "main" {
  family = var.parameter_group_family
  name   = "${var.name_prefix}-db-params"

  # MongoDB-compatible parameters for DocumentDB
  dynamic "parameter" {
    for_each = var.db_parameters
    content {
      name  = parameter.value.name
      value = parameter.value.value
    }
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# DB Option Group (for engines that support it)
resource "aws_db_option_group" "main" {
  count = var.create_option_group ? 1 : 0

  name                     = "${var.name_prefix}-db-options"
  option_group_description = "Option group for ${var.name_prefix}"
  engine_name              = var.engine
  major_engine_version     = var.major_engine_version

  dynamic "option" {
    for_each = var.db_options
    content {
      option_name = option.value.option_name
      
      dynamic "option_settings" {
        for_each = option.value.option_settings
        content {
          name  = option_settings.value.name
          value = option_settings.value.value
        }
      }
    }
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# Primary RDS Instance
resource "aws_db_instance" "main" {
  # Basic configuration
  identifier = "${var.name_prefix}-db"
  
  # Engine configuration
  engine         = var.engine
  engine_version = var.engine_version
  instance_class = var.instance_class != null ? var.instance_class : local.final_config.instance_class

  # Database configuration
  db_name  = var.database_name
  username = var.username
  password = var.password != null ? var.password : random_password.master_password[0].result

  # Storage configuration
  allocated_storage     = var.allocated_storage != null ? var.allocated_storage : local.final_config.allocated_storage
  max_allocated_storage = var.max_allocated_storage != null ? var.max_allocated_storage : local.final_config.max_allocated_storage
  storage_type          = var.storage_type
  storage_encrypted     = var.storage_encrypted
  kms_key_id           = var.create_kms_key ? aws_kms_key.rds[0].arn : var.kms_key_id

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.vpc_security_group_ids
  port                   = var.port
  publicly_accessible    = var.publicly_accessible

  # Parameter and Option Groups
  parameter_group_name = aws_db_parameter_group.main.name
  option_group_name    = var.create_option_group ? aws_db_option_group.main[0].name : null

  # Backup configuration
  backup_retention_period = var.backup_retention_period != null ? var.backup_retention_period : local.final_config.backup_retention_period
  backup_window          = var.backup_window
  maintenance_window     = var.maintenance_window
  copy_tags_to_snapshot  = true
  skip_final_snapshot    = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # High Availability
  multi_az = var.multi_az != null ? var.multi_az : local.final_config.multi_az

  # Monitoring and Performance
  monitoring_interval = var.monitoring_interval
  monitoring_role_arn = var.monitoring_interval > 0 ? var.monitoring_role_arn : null
  
  performance_insights_enabled    = var.performance_insights_enabled != null ? var.performance_insights_enabled : local.final_config.performance_insights
  performance_insights_kms_key_id = var.performance_insights_enabled && var.create_kms_key ? aws_kms_key.rds[0].arn : var.performance_insights_kms_key_id

  # Security
  deletion_protection = var.deletion_protection != null ? var.deletion_protection : local.final_config.deletion_protection
  
  # Auto minor version upgrade
  auto_minor_version_upgrade = var.auto_minor_version_upgrade

  # Enhanced monitoring
  enabled_cloudwatch_logs_exports = var.enabled_cloudwatch_logs_exports

  tags = local.common_tags

  lifecycle {
    ignore_changes = [password]
  }

  depends_on = [
    aws_db_subnet_group.main,
    aws_db_parameter_group.main
  ]
}

# Read Replica (if enabled)
resource "aws_db_instance" "read_replica" {
  count = var.create_read_replica ? var.read_replica_count : 0

  identifier = "${var.name_prefix}-db-replica-${count.index + 1}"
  
  # Read replica configuration
  replicate_source_db = aws_db_instance.main.identifier
  instance_class     = var.read_replica_instance_class != null ? var.read_replica_instance_class : var.instance_class

  # Storage (inherited from source)
  storage_encrypted = var.storage_encrypted
  kms_key_id       = var.create_kms_key ? aws_kms_key.rds[0].arn : var.kms_key_id

  # Network (can be in different AZ/region)
  vpc_security_group_ids = var.vpc_security_group_ids
  publicly_accessible    = var.publicly_accessible

  # Performance Insights
  performance_insights_enabled    = var.performance_insights_enabled
  performance_insights_kms_key_id = var.performance_insights_enabled && var.create_kms_key ? aws_kms_key.rds[0].arn : var.performance_insights_kms_key_id

  # Monitoring
  monitoring_interval = var.monitoring_interval
  monitoring_role_arn = var.monitoring_interval > 0 ? var.monitoring_role_arn : null

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-db-replica-${count.index + 1}"
    Type = "read-replica"
  })

  depends_on = [aws_db_instance.main]
}

# CloudWatch Log Groups for database logs
resource "aws_cloudwatch_log_group" "rds_logs" {
  for_each = toset(var.enabled_cloudwatch_logs_exports)

  name              = "/aws/rds/instance/${aws_db_instance.main.identifier}/${each.value}"
  retention_in_days = var.cloudwatch_logs_retention_days

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-${each.value}-logs"
    LogType = each.value
  })
}

# SSM Parameters for database connection details
resource "aws_ssm_parameter" "db_endpoint" {
  count = var.store_credentials_in_ssm ? 1 : 0

  name  = "/${var.name_prefix}/database/endpoint"
  type  = "String"
  value = aws_db_instance.main.endpoint

  tags = local.common_tags
}

resource "aws_ssm_parameter" "db_port" {
  count = var.store_credentials_in_ssm ? 1 : 0

  name  = "/${var.name_prefix}/database/port"
  type  = "String"
  value = aws_db_instance.main.port

  tags = local.common_tags
}

resource "aws_ssm_parameter" "db_name" {
  count = var.store_credentials_in_ssm ? 1 : 0

  name  = "/${var.name_prefix}/database/name"
  type  = "String"
  value = aws_db_instance.main.db_name

  tags = local.common_tags
}

resource "aws_ssm_parameter" "db_username" {
  count = var.store_credentials_in_ssm ? 1 : 0

  name  = "/${var.name_prefix}/database/username"
  type  = "SecureString"
  value = aws_db_instance.main.username

  tags = local.common_tags
}

resource "aws_ssm_parameter" "db_password" {
  count = var.store_credentials_in_ssm ? 1 : 0

  name  = "/${var.name_prefix}/database/password"
  type  = "SecureString"
  value = var.password != null ? var.password : random_password.master_password[0].result

  tags = local.common_tags
}

# Database connection string
resource "aws_ssm_parameter" "connection_string" {
  count = var.store_credentials_in_ssm ? 1 : 0

  name = "/${var.name_prefix}/database/connection_string"
  type = "SecureString"
  value = format("%s://%s:%s@%s:%s/%s",
    var.engine,
    aws_db_instance.main.username,
    var.password != null ? var.password : random_password.master_password[0].result,
    aws_db_instance.main.endpoint,
    aws_db_instance.main.port,
    aws_db_instance.main.db_name
  )

  tags = local.common_tags
}
