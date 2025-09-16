# infrastructure/terraform/elasticache.tf
resource "aws_elasticache_subnet_group" "school_erp" {
  name       = "${var.project_name}-${var.environment}-cache-subnet"
  subnet_ids = var.private_subnet_ids
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-cache-subnet"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_elasticache_parameter_group" "school_erp" {
  family = "redis7"
  name   = "${var.project_name}-${var.environment}-redis-params"

  # Performance optimizations
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
  
  parameter {
    name  = "timeout"
    value = "300"
  }
  
  parameter {
    name  = "tcp-keepalive"
    value = "60"
  }
}

resource "aws_elasticache_replication_group" "school_erp" {
  replication_group_id       = "${var.project_name}-${var.environment}-redis"
  description                = "Redis cluster for ${var.project_name} ${var.environment}"
  
  # Node configuration
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.school_erp.name
  
  # Cluster configuration
  num_cache_clusters = var.redis_num_cache_nodes
  
  # Multi-AZ and backup
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  # Backup configuration
  snapshot_retention_limit = 5
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "sun:05:00-sun:06:00"
  
  # Security
  subnet_group_name  = aws_elasticache_subnet_group.school_erp.name
  security_group_ids = [aws_security_group.elasticache.id]
  
  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token
  
  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-redis"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Security Group for ElastiCache
resource "aws_security_group" "elasticache" {
  name_prefix = "${var.project_name}-${var.environment}-elasticache-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-elasticache-sg"
    Environment = var.environment
  }
}

# CloudWatch Log Group for Redis logs
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${var.project_name}-${var.environment}/slow-log"
  retention_in_days = 7
}
