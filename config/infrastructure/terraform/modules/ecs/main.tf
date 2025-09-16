# ECS Cluster
resource "aws_ecs_cluster" "school_erp_cluster" {
  name = "${var.environment}-${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }

  capacity_providers = var.capacity_providers

  default_capacity_provider_strategy {
    capacity_provider = var.default_capacity_provider
    weight            = 100
    base              = 1
  }

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-cluster"
    Environment = var.environment
    Component   = "ecs-cluster"
  })
}

# CloudWatch Log Group for ECS
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/${var.environment}-${var.project_name}"
  retention_in_days = var.log_retention_days

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-logs"
    Environment = var.environment
    Component   = "logging"
  })
}

# Application Load Balancer
resource "aws_lb" "school_erp_alb" {
  name               = "${var.environment}-${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "production" ? true : false

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-alb"
    Environment = var.environment
    Component   = "load-balancer"
  })
}

# Target Group for API
resource "aws_lb_target_group" "api_tg" {
  name        = "${var.environment}-${var.project_name}-api-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 10
    timeout             = 10
    interval            = 30
    path                = "/health"
    matcher             = "200"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  depends_on = [aws_lb.school_erp_alb]

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-api-tg"
    Environment = var.environment
    Component   = "target-group"
  })
}

# ALB Listener
resource "aws_lb_listener" "api_listener" {
  load_balancer_arn = aws_lb.school_erp_alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS Listener (if SSL certificate is provided)
resource "aws_lb_listener" "api_listener_https" {
  count = var.ssl_certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.school_erp_alb.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = var.ssl_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api_tg.arn
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "school_erp_api" {
  family                   = "${var.environment}-${var.project_name}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "school-erp-api"
      image     = var.docker_image_uri
      essential = true
      
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = tostring(var.container_port)
        },
        {
          name  = "APP_NAME"
          value = "School ERP SaaS"
        },
        {
          name  = "DEPLOYMENT_TYPE"
          value = "ecs"
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        }
      ]

      secrets = [
        {
          name      = "MONGODB_URI"
          valueFrom = var.mongodb_uri_secret_arn
        },
        {
          name      = "JWT_ACCESS_SECRET"
          valueFrom = var.jwt_access_secret_arn
        },
        {
          name      = "JWT_REFRESH_SECRET"
          valueFrom = var.jwt_refresh_secret_arn
        },
        {
          name      = "CLOUDINARY_CLOUD_NAME"
          valueFrom = var.cloudinary_cloud_name_secret_arn
        },
        {
          name      = "CLOUDINARY_API_KEY"
          valueFrom = var.cloudinary_api_key_secret_arn
        },
        {
          name      = "CLOUDINARY_API_SECRET"
          valueFrom = var.cloudinary_api_secret_secret_arn
        },
        {
          name      = "SENTRY_DSN"
          valueFrom = var.sentry_dsn_secret_arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_logs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 60
      }

      stopTimeout = 30
    }
  ])

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-task-definition"
    Environment = var.environment
    Component   = "ecs-task"
  })
}

# ECS Service
resource "aws_ecs_service" "school_erp_service" {
  name            = "${var.environment}-${var.project_name}-service"
  cluster         = aws_ecs_cluster.school_erp_cluster.id
  task_definition = aws_ecs_task_definition.school_erp_api.arn
  desired_count   = var.desired_count
  launch_type     = var.launch_type

  deployment_configuration {
    maximum_percent         = var.max_capacity_during_deployment
    minimum_healthy_percent = var.min_capacity_during_deployment
    
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
  }

  network_configuration {
    security_groups  = [aws_security_group.ecs_tasks_sg.id]
    subnets          = var.private_subnet_ids
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api_tg.arn
    container_name   = "school-erp-api"
    container_port   = var.container_port
  }

  service_registries {
    registry_arn = aws_service_discovery_service.school_erp_discovery.arn
  }

  depends_on = [
    aws_lb_listener.api_listener,
    aws_lb_listener.api_listener_https,
    aws_iam_role_policy_attachment.ecs_execution_policy,
    aws_iam_role_policy_attachment.ecs_task_policy
  ]

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-service"
    Environment = var.environment
    Component   = "ecs-service"
  })
}

# Auto Scaling Target
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.school_erp_cluster.name}/${aws_ecs_service.school_erp_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Auto Scaling Policy - CPU
resource "aws_appautoscaling_policy" "ecs_cpu_scaling_policy" {
  name               = "${var.environment}-${var.project_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.cpu_target_value
    scale_in_cooldown  = var.scale_in_cooldown
    scale_out_cooldown = var.scale_out_cooldown
  }
}

# Auto Scaling Policy - Memory
resource "aws_appautoscaling_policy" "ecs_memory_scaling_policy" {
  name               = "${var.environment}-${var.project_name}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = var.memory_target_value
    scale_in_cooldown  = var.scale_in_cooldown
    scale_out_cooldown = var.scale_out_cooldown
  }
}

# Service Discovery
resource "aws_service_discovery_private_dns_namespace" "school_erp_namespace" {
  name        = "${var.environment}-${var.project_name}.local"
  description = "Private DNS namespace for School ERP services"
  vpc         = var.vpc_id

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-namespace"
    Environment = var.environment
    Component   = "service-discovery"
  })
}

resource "aws_service_discovery_service" "school_erp_discovery" {
  name = "api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.school_erp_namespace.id

    dns_records {
      ttl  = 60
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_grace_period_seconds = 300

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-discovery"
    Environment = var.environment
    Component   = "service-discovery"
  })
}

# Security Groups
resource "aws_security_group" "alb_sg" {
  name_prefix = "${var.environment}-${var.project_name}-alb-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-alb-sg"
    Environment = var.environment
    Component   = "security-group"
  })
}

resource "aws_security_group" "ecs_tasks_sg" {
  name_prefix = "${var.environment}-${var.project_name}-ecs-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-ecs-sg"
    Environment = var.environment
    Component   = "security-group"
  })
}

# IAM Roles and Policies
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.environment}-${var.project_name}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-ecs-execution-role"
    Environment = var.environment
    Component   = "iam-role"
  })
}

resource "aws_iam_role" "ecs_task_role" {
  name = "${var.environment}-${var.project_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-ecs-task-role"
    Environment = var.environment
    Component   = "iam-role"
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_policy" "ecs_secrets_policy" {
  name        = "${var.environment}-${var.project_name}-ecs-secrets-policy"
  description = "Policy to allow ECS tasks to access Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.secrets_manager_arns
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-secrets-policy"
    Environment = var.environment
    Component   = "iam-policy"
  })
}

resource "aws_iam_role_policy_attachment" "ecs_secrets_policy_attachment" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = aws_iam_policy.ecs_secrets_policy.arn
}

resource "aws_iam_policy" "ecs_task_policy" {
  name        = "${var.environment}-${var.project_name}-ecs-task-policy"
  description = "Policy for ECS task role"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "${aws_cloudwatch_log_group.ecs_logs.arn}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = var.s3_bucket_arns
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/${var.environment}/${var.project_name}/*"
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-task-policy"
    Environment = var.environment
    Component   = "iam-policy"
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_policy" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.ecs_task_policy.arn
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "${var.environment}-${var.project_name}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ECS cpu utilization"
  alarm_actions       = var.sns_topic_arns

  dimensions = {
    ServiceName = aws_ecs_service.school_erp_service.name
    ClusterName = aws_ecs_cluster.school_erp_cluster.name
  }

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-high-cpu-alarm"
    Environment = var.environment
    Component   = "monitoring"
  })
}

resource "aws_cloudwatch_metric_alarm" "high_memory" {
  alarm_name          = "${var.environment}-${var.project_name}-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ECS memory utilization"
  alarm_actions       = var.sns_topic_arns

  dimensions = {
    ServiceName = aws_ecs_service.school_erp_service.name
    ClusterName = aws_ecs_cluster.school_erp_cluster.name
  }

  tags = merge(var.common_tags, {
    Name        = "${var.environment}-${var.project_name}-high-memory-alarm"
    Environment = var.environment
    Component   = "monitoring"
  })
}
