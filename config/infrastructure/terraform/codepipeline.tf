# infrastructure/terraform/codepipeline.tf
resource "aws_codepipeline" "school_erp_pipeline" {
  name     = "${var.project_name}-${var.environment}-pipeline"
  role_arn = aws_iam_role.codepipeline_role.arn

  artifact_store {
    location = aws_s3_bucket.codepipeline_artifacts.bucket
    type     = "S3"

    encryption_key {
      id   = aws_kms_alias.codepipeline_kms_key.arn
      type = "KMS"
    }
  }

  # Source Stage - GitHub Integration
  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]

      configuration = {
        ConnectionArn    = aws_codestarconnections_connection.github.arn
        FullRepositoryId = var.github_repo
        BranchName       = var.source_branch
        OutputArtifactFormat = "CODE_ZIP"
        DetectChanges    = true
      }
    }
  }

  # Build Stage - Multi-step compilation and testing
  stage {
    name = "Build"

    # Code Quality & Security Scan
    action {
      name             = "CodeQuality"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      input_artifacts  = ["source_output"]
      output_artifacts = ["quality_output"]
      version          = "1"

      configuration = {
        ProjectName = aws_codebuild_project.code_quality.name
      }
    }

    # Unit Tests
    action {
      name             = "UnitTests"
      category         = "Test"
      owner            = "AWS"
      provider         = "CodeBuild"
      input_artifacts  = ["source_output"]
      output_artifacts = ["test_output"]
      version          = "1"
      run_order       = 2

      configuration = {
        ProjectName = aws_codebuild_project.unit_tests.name
      }
    }

    # Docker Build
    action {
      name             = "DockerBuild"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      input_artifacts  = ["source_output"]
      output_artifacts = ["build_output"]
      version          = "1"
      run_order       = 3

      configuration = {
        ProjectName = aws_codebuild_project.docker_build.name
        EnvironmentVariables = jsonencode([
          {
            name  = "IMAGE_REPO_NAME"
            value = aws_ecr_repository.app_repo.name
          },
          {
            name  = "IMAGE_TAG"
            value = "#{codepipeline.PipelineExecutionId}"
          },
          {
            name  = "AWS_DEFAULT_REGION"
            value = var.aws_region
          },
          {
            name  = "AWS_ACCOUNT_ID"
            value = data.aws_caller_identity.current.account_id
          }
        ])
      }
    }
  }

  # Deploy to Development
  stage {
    name = "DeployDev"

    action {
      name            = "DeployDevelopment"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "ECS"
      input_artifacts = ["build_output"]
      version         = "1"

      configuration = {
        ClusterName = aws_ecs_cluster.main.name
        ServiceName = "${var.project_name}-dev-service"
        FileName    = "imagedefinitions.json"
      }
    }

    # Development Integration Tests
    action {
      name            = "DevIntegrationTests"
      category        = "Test"
      owner           = "AWS"
      provider        = "CodeBuild"
      input_artifacts = ["source_output"]
      version         = "1"
      run_order      = 2

      configuration = {
        ProjectName = aws_codebuild_project.integration_tests.name
        EnvironmentVariables = jsonencode([
          {
            name  = "TEST_ENVIRONMENT"
            value = "development"
          },
          {
            name  = "API_ENDPOINT"
            value = "https://dev-api.${var.domain_name}"
          }
        ])
      }
    }
  }

  # Manual Approval for Staging
  stage {
    name = "ApprovalForStaging"

    action {
      name     = "ManualApprovalForStaging"
      category = "Approval"
      owner    = "AWS"
      provider = "Manual"
      version  = "1"

      configuration = {
        NotificationArn = aws_sns_topic.pipeline_notifications.arn
        CustomData      = "Please review the development deployment and approve for staging deployment."
        ExternalEntityLink = "https://dev-api.${var.domain_name}/health"
      }
    }
  }

  # Deploy to Staging
  stage {
    name = "DeployStaging"

    action {
      name            = "DeployStaging"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "ECS"
      input_artifacts = ["build_output"]
      version         = "1"

      configuration = {
        ClusterName = aws_ecs_cluster.main.name
        ServiceName = "${var.project_name}-staging-service"
        FileName    = "imagedefinitions.json"
      }
    }

    # Staging End-to-End Tests
    action {
      name            = "StagingE2ETests"
      category        = "Test"
      owner           = "AWS"
      provider        = "CodeBuild"
      input_artifacts = ["source_output"]
      version         = "1"
      run_order      = 2

      configuration = {
        ProjectName = aws_codebuild_project.e2e_tests.name
        EnvironmentVariables = jsonencode([
          {
            name  = "TEST_ENVIRONMENT"
            value = "staging"
          },
          {
            name  = "API_ENDPOINT"
            value = "https://staging-api.${var.domain_name}"
          }
        ])
      }
    }

    # Performance Tests
    action {
      name            = "PerformanceTests"
      category        = "Test"
      owner           = "AWS"
      provider        = "CodeBuild"
      input_artifacts = ["source_output"]
      version         = "1"
      run_order      = 3

      configuration = {
        ProjectName = aws_codebuild_project.performance_tests.name
      }
    }
  }

  # Multi-Approval for Production
  stage {
    name = "ApprovalForProduction"

    action {
      name     = "TechnicalApproval"
      category = "Approval"
      owner    = "AWS"
      provider = "Manual"
      version  = "1"

      configuration = {
        NotificationArn = aws_sns_topic.pipeline_notifications.arn
        CustomData      = "Technical approval required for production deployment."
        ExternalEntityLink = "https://staging-api.${var.domain_name}/health"
      }
    }

    action {
      name      = "BusinessApproval"
      category  = "Approval"
      owner     = "AWS"
      provider  = "Manual"
      version   = "1"
      run_order = 2

      configuration = {
        NotificationArn = aws_sns_topic.pipeline_notifications.arn
        CustomData      = "Business approval required for production deployment."
      }
    }
  }

  # Deploy to Production with Blue/Green
  stage {
    name = "DeployProduction"

    action {
      name            = "DeployProduction"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "CodeDeployToECS"
      input_artifacts = ["build_output"]
      version         = "1"

      configuration = {
        ApplicationName     = aws_codedeploy_app.main.name
        DeploymentGroupName = aws_codedeploy_deployment_group.production.deployment_group_name
        TaskDefinitionTemplateArtifact = "build_output"
        AppSpecTemplateArtifact = "build_output"
      }
    }

    # Production Health Check
    action {
      name            = "ProductionHealthCheck"
      category        = "Test"
      owner           = "AWS"
      provider        = "CodeBuild"
      input_artifacts = ["source_output"]
      version         = "1"
      run_order      = 2

      configuration = {
        ProjectName = aws_codebuild_project.health_check.name
        EnvironmentVariables = jsonencode([
          {
            name  = "TEST_ENVIRONMENT"
            value = "production"
          },
          {
            name  = "API_ENDPOINT"
            value = "https://api.${var.domain_name}"
          }
        ])
      }
    }
  }

  tags = {
    Name        = "${var.project_name}-pipeline"
    Environment = var.environment
    Project     = var.project_name
  }
}
