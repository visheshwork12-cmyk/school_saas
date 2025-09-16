# infrastructure/terraform/pipeline-monitoring.tf

# CloudWatch Alarms for Pipeline
resource "aws_cloudwatch_metric_alarm" "pipeline_failed" {
  alarm_name          = "${var.project_name}-pipeline-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "PipelineExecutionFailure"
  namespace           = "AWS/CodePipeline"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors pipeline failures"
  alarm_actions       = [aws_sns_topic.pipeline_notifications.arn]

  dimensions = {
    PipelineName = aws_codepipeline.school_erp_pipeline.name
  }
}

resource "aws_cloudwatch_metric_alarm" "build_duration" {
  alarm_name          = "${var.project_name}-build-duration"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Duration"
  namespace           = "AWS/CodeBuild"
  period              = "300"
  statistic           = "Average"
  threshold           = "900" # 15 minutes
  alarm_description   = "This metric monitors build duration"
  alarm_actions       = [aws_sns_topic.pipeline_notifications.arn]

  dimensions = {
    ProjectName = aws_codebuild_project.docker_build.name
  }
}

# Pipeline Dashboard
resource "aws_cloudwatch_dashboard" "pipeline_dashboard" {
  dashboard_name = "${var.project_name}-pipeline-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/CodePipeline", "PipelineExecutionSuccess", "PipelineName", aws_codepipeline.school_erp_pipeline.name],
            [".", "PipelineExecutionFailure", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Pipeline Executions"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/CodeBuild", "Duration", "ProjectName", aws_codebuild_project.docker_build.name],
            [".", ".", ".", aws_codebuild_project.unit_tests.name],
            [".", ".", ".", aws_codebuild_project.integration_tests.name]
          ]
          view   = "timeSeries"
          region = var.aws_region
          title  = "Build Durations"
          period = 300
        }
      }
    ]
  })
}
