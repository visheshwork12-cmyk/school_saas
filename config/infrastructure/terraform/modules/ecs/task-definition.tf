# config/infrastructure/terraform/modules/ecs/task-definition.tf
# ECS Task Definition optimized for Auto Scaling

resource "aws_ecs_task_definition" "school_erp_task" {
  family                   = "${var.project_name}-${var.environment}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn           = aws_iam_role.ecs_task_role.arn
  
  container_definitions = jsonencode([
    {
      name  = "school-erp-api"
      image = var.container_image
      
      # Port Configuration
      portMappings = [
        {
          containerPort = var.container_port
          hostPort     = var.container_port
          protocol     = "tcp"
        }
      ]
      
      # Resource Configuration for Auto Scaling
      cpu = var.task_cpu
      memoryReservation = floor(var.task_memory * 0.8)
      memory = var.task_memory
      
      # Health Check
      healthCheck = {
        command = [
          "CMD-SHELL",
          "curl -f http://localhost:${var.container_port}/health || exit 1"
        ]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      
      # Environment Variables
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
          name  = "DEPLOYMENT_TYPE"
          value = "ecs-fargate"
        }
      ]
      
      # Secrets from AWS Systems Manager
      secrets = [
        {
          name      = "MONGODB_URI"
          valueFrom = "${aws_ssm_parameter.mongodb_uri.arn}"
        },
        {
          name      = "JWT_ACCESS_SECRET"
          valueFrom = "${aws_ssm_parameter.jwt_secret.arn}"
        }
      ]
      
      # Logging Configuration
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_logs.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
      
      # Essential container
      essential = true
      
      # Performance Optimization
      ulimits = [
        {
          name      = "nofile"
          softLimit = 65536
          hardLimit = 65536
        }
      ]
    }
  ])
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-task-definition"
    Environment = var.environment
    Component   = "ecs-task-definition"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/${var.project_name}-${var.environment}"
  retention_in_days = var.environment == "production" ? 30 : 7
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-logs"
    Environment = var.environment
    Component   = "logging"
  }
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.project_name}-${var.environment}-ecs-execution-role"
  
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
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-ecs-execution-role"
    Environment = var.environment
    Component   = "iam"
  }
}

# IAM Role for ECS Task
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-${var.environment}-ecs-task-role"
  
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
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-ecs-task-role"
    Environment = var.environment
    Component   = "iam"
  }
}

# Attach policies to execution role
resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Custom policy for SSM parameters and CloudWatch logs
resource "aws_iam_role_policy" "ecs_execution_custom_policy" {
  name = "${var.project_name}-${var.environment}-ecs-execution-custom"
  role = aws_iam_role.ecs_execution_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameters",
          "ssm:GetParameter",
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_ssm_parameter.mongodb_uri.arn,
          aws_ssm_parameter.jwt_secret.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.ecs_logs.arn}:*"
      }
    ]
  })
}

# SSM Parameters for secrets
resource "aws_ssm_parameter" "mongodb_uri" {
  name        = "/${var.project_name}/${var.environment}/mongodb-uri"
  description = "MongoDB connection URI"
  type        = "SecureString"
  value       = var.mongodb_uri
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-mongodb-uri"
    Environment = var.environment
    Component   = "secrets"
  }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name        = "/${var.project_name}/${var.environment}/jwt-secret"
  description = "JWT secret key"
  type        = "SecureString"
  value       = var.jwt_secret
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-jwt-secret"
    Environment = var.environment
    Component   = "secrets"
  }
}
