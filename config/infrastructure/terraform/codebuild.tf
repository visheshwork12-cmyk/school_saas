# infrastructure/terraform/codebuild.tf

# Code Quality and Security Scanning
resource "aws_codebuild_project" "code_quality" {
  name          = "${var.project_name}-code-quality"
  description   = "Code quality checks and security scanning"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_MEDIUM"
    image                      = "aws/codebuild/amazonlinux2-x86_64-standard:4.0"
    type                       = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "NODE_ENV"
      value = "test"
    }
  }

  source {
    type = "CODEPIPELINE"
    buildspec = "buildspecs/quality-check.yml"
  }

  vpc_config {
    vpc_id = var.vpc_id
    subnets = var.private_subnet_ids
    security_group_ids = [aws_security_group.codebuild.id]
  }

  tags = {
    Name = "${var.project_name}-code-quality"
    Environment = var.environment
  }
}

# Unit Tests
resource "aws_codebuild_project" "unit_tests" {
  name          = "${var.project_name}-unit-tests"
  description   = "Unit tests execution"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_MEDIUM"
    image                      = "aws/codebuild/amazonlinux2-x86_64-standard:4.0"
    type                       = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "NODE_ENV"
      value = "test"
    }

    environment_variable {
      name  = "CI"
      value = "true"
    }
  }

  source {
    type = "CODEPIPELINE"
    buildspec = "buildspecs/unit-tests.yml"
  }

  tags = {
    Name = "${var.project_name}-unit-tests"
    Environment = var.environment
  }
}

# Docker Build and Push
resource "aws_codebuild_project" "docker_build" {
  name          = "${var.project_name}-docker-build"
  description   = "Docker image build and push to ECR"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_LARGE"
    image                      = "aws/codebuild/amazonlinux2-x86_64-standard:4.0"
    type                       = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode            = true

    environment_variable {
      name  = "NODE_ENV"
      value = "production"
    }
  }

  source {
    type = "CODEPIPELINE"
    buildspec = "buildspecs/docker-build.yml"
  }

  tags = {
    Name = "${var.project_name}-docker-build"
    Environment = var.environment
  }
}

# Integration Tests
resource "aws_codebuild_project" "integration_tests" {
  name          = "${var.project_name}-integration-tests"
  description   = "Integration tests execution"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_MEDIUM"
    image                      = "aws/codebuild/amazonlinux2-x86_64-standard:4.0"
    type                       = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "NODE_ENV"
      value = "test"
    }
  }

  source {
    type = "CODEPIPELINE"
    buildspec = "buildspecs/integration-tests.yml"
  }

  vpc_config {
    vpc_id = var.vpc_id
    subnets = var.private_subnet_ids
    security_group_ids = [aws_security_group.codebuild.id]
  }

  tags = {
    Name = "${var.project_name}-integration-tests"
    Environment = var.environment
  }
}

# End-to-End Tests
resource "aws_codebuild_project" "e2e_tests" {
  name          = "${var.project_name}-e2e-tests"
  description   = "End-to-end tests execution"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_LARGE"
    image                      = "aws/codebuild/amazonlinux2-x86_64-standard:4.0"
    type                       = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "NODE_ENV"
      value = "test"
    }
  }

  source {
    type = "CODEPIPELINE"
    buildspec = "buildspecs/e2e-tests.yml"
  }

  tags = {
    Name = "${var.project_name}-e2e-tests"
    Environment = var.environment
  }
}

# Performance Tests
resource "aws_codebuild_project" "performance_tests" {
  name          = "${var.project_name}-performance-tests"
  description   = "Performance tests execution"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_LARGE"
    image                      = "aws/codebuild/amazonlinux2-x86_64-standard:4.0"
    type                       = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
  }

  source {
    type = "CODEPIPELINE"
    buildspec = "buildspecs/performance-tests.yml"
  }

  tags = {
    Name = "${var.project_name}-performance-tests"
    Environment = var.environment
  }
}

# Health Check
resource "aws_codebuild_project" "health_check" {
  name          = "${var.project_name}-health-check"
  description   = "Post-deployment health checks"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                      = "aws/codebuild/amazonlinux2-x86_64-standard:4.0"
    type                       = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
  }

  source {
    type = "CODEPIPELINE"
    buildspec = "buildspecs/health-check.yml"
  }

  tags = {
    Name = "${var.project_name}-health-check"
    Environment = var.environment
  }
}
