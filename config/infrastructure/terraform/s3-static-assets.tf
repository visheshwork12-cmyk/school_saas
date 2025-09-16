# infrastructure/terraform/s3-static-assets.tf
resource "aws_s3_bucket" "static_assets" {
  bucket = "${var.project_name}-static-assets-${var.environment}"
  
  tags = {
    Name        = "${var.project_name}-static-assets"
    Environment = var.environment
    Project     = var.project_name
    Purpose     = "Static Assets Storage"
  }
}

# Separate bucket for different environments
resource "aws_s3_bucket" "static_assets_versioned" {
  bucket = "${var.project_name}-static-${var.environment}-${random_string.bucket_suffix.result}"
  
  tags = {
    Name        = "${var.project_name}-static-versioned"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

# Public Access Block Configuration
resource "aws_s3_bucket_public_access_block" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Bucket Versioning
resource "aws_s3_bucket_versioning" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# CORS Configuration
resource "aws_s3_bucket_cors_configuration" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = [
      "https://${var.domain_name}",
      "https://www.${var.domain_name}",
      var.environment == "development" ? "http://localhost:3000" : null,
      var.environment == "development" ? "http://localhost:3001" : null
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }

  cors_rule {
    allowed_methods = ["PUT", "POST", "DELETE"]
    allowed_origins = [
      "https://${var.domain_name}",
      "https://www.${var.domain_name}"
    ]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}

# Lifecycle Configuration
resource "aws_s3_bucket_lifecycle_configuration" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id

  rule {
    id     = "static_assets_lifecycle"
    status = "Enabled"

    # Delete incomplete multipart uploads after 1 day
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }

    # Move old versions to IA after 30 days
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    # Delete old versions after 90 days
    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    # Clean up temporary uploads
    filter {
      prefix = "temp/"
    }

    expiration {
      days = 7
    }
  }

  rule {
    id     = "cache_optimization"
    status = "Enabled"

    # Images lifecycle
    filter {
      prefix = "images/"
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

# Bucket Policy for Public Read Access to Static Assets
resource "aws_s3_bucket_policy" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource = [
          "${aws_s3_bucket.static_assets.arn}/public/*",
          "${aws_s3_bucket.static_assets.arn}/assets/*",
          "${aws_s3_bucket.static_assets.arn}/images/*",
          "${aws_s3_bucket.static_assets.arn}/css/*",
          "${aws_s3_bucket.static_assets.arn}/js/*",
          "${aws_s3_bucket.static_assets.arn}/fonts/*"
        ]
      },
      {
        Sid    = "DenyInsecureConnections"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.static_assets.arn,
          "${aws_s3_bucket.static_assets.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.static_assets]
}
