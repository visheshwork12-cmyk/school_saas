# infrastructure/terraform/modules/ecr/policies.tf
# IAM policies for ECR module

# IAM policy for CI/CD push access
resource "aws_iam_policy" "ecr_push_policy" {
  count = length(var.repository_read_write_access_arns) > 0 ? 1 : 0

  name_prefix = "${var.name_prefix}-ecr-push-"
  description = "Policy for pushing images to ECR repositories"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings",
          "ecr:StartImageScan"
        ]
        Resource = [
          for repo in aws_ecr_repository.repositories : repo.arn
        ]
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ecr-push-policy"
  })
}

# IAM policy for read-only access
resource "aws_iam_policy" "ecr_pull_policy" {
  count = length(var.repository_read_access_arns) > 0 ? 1 : 0

  name_prefix = "${var.name_prefix}-ecr-pull-"
  description = "Policy for pulling images from ECR repositories"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings"
        ]
        Resource = [
          for repo in aws_ecr_repository.repositories : repo.arn
        ]
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ecr-pull-policy"
  })
}

# IAM role for ECS/EKS to pull images
resource "aws_iam_role" "ecr_execution_role" {
  name_prefix = "${var.name_prefix}-ecr-execution-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = [
            "ecs-tasks.amazonaws.com",
            "ec2.amazonaws.com"
          ]
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ecr-execution-role"
  })
}

# Attach ECR pull policy to execution role
resource "aws_iam_role_policy_attachment" "ecr_execution_role_policy" {
  role       = aws_iam_role.ecr_execution_role.name
  policy_arn = length(aws_iam_policy.ecr_pull_policy) > 0 ? aws_iam_policy.ecr_pull_policy[0].arn : "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# Cross-account access policy (if needed)
resource "aws_iam_policy" "ecr_cross_account_policy" {
  count = var.enable_cross_account_access ? 1 : 0

  name_prefix = "${var.name_prefix}-ecr-cross-account-"
  description = "Policy for cross-account ECR access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCrossAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = var.cross_account_access_arns
        }
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability"
        ]
        Resource = [
          for repo in aws_ecr_repository.repositories : repo.arn
        ]
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ecr-cross-account-policy"
  })
}
