# infrastructure/terraform/cloudfront-cdn.tf
# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "static_assets" {
  name                              = "${var.project_name}-static-assets-oac"
  description                       = "OAC for ${var.project_name} static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "static_assets" {
  origin {
    domain_name              = aws_s3_bucket.static_assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.static_assets.id
    origin_id                = "S3-${aws_s3_bucket.static_assets.bucket}"

    # Custom headers for cache optimization
    custom_header {
      name  = "Cache-Control"
      value = "public, max-age=31536000"
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} Static Assets CDN"
  default_root_object = "index.html"

  # Aliases for custom domain
  aliases = var.environment == "production" ? [
    "static.${var.domain_name}",
    "assets.${var.domain_name}",
    "cdn.${var.domain_name}"
  ] : []

  # Default cache behavior
  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.static_assets.bucket}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400   # 1 day
    max_ttl     = 31536000 # 1 year
  }

  # Cache behavior for images
  ordered_cache_behavior {
    path_pattern           = "/images/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.static_assets.bucket}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 2592000  # 30 days
    max_ttl     = 31536000 # 1 year
  }

  # Cache behavior for CSS/JS
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.static_assets.bucket}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 604800   # 7 days
    max_ttl     = 31536000 # 1 year
  }

  # Cache behavior for API responses (if serving from S3)
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.static_assets.bucket}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "CloudFront-Forwarded-Proto"]
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0        # No caching for API
    max_ttl     = 86400    # 1 day max
  }

  # Geographic restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL Certificate
  viewer_certificate {
    cloudfront_default_certificate = var.environment != "production"
    acm_certificate_arn           = var.environment == "production" ? aws_acm_certificate.static_assets[0].arn : null
    ssl_support_method            = var.environment == "production" ? "sni-only" : null
    minimum_protocol_version      = "TLSv1.2_2021"
  }

  # Web Application Firewall
  web_acl_id = var.environment == "production" ? aws_wafv2_web_acl.static_assets[0].arn : null

  # Custom error pages
  custom_error_response {
    error_caching_min_ttl = 10
    error_code            = 404
    response_code         = 404
    response_page_path    = "/error-pages/404.html"
  }

  custom_error_response {
    error_caching_min_ttl = 10
    error_code            = 403
    response_code         = 403
    response_page_path    = "/error-pages/403.html"
  }

  tags = {
    Name        = "${var.project_name}-static-assets-cdn"
    Environment = var.environment
    Project     = var.project_name
  }
}

# SSL Certificate for CloudFront (if using custom domain)
resource "aws_acm_certificate" "static_assets" {
  count           = var.environment == "production" ? 1 : 0
  domain_name     = "static.${var.domain_name}"
  
  subject_alternative_names = [
    "assets.${var.domain_name}",
    "cdn.${var.domain_name}"
  ]
  
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.project_name}-static-assets-cert"
    Environment = var.environment
  }
}

# WAF for CloudFront (Production only)
resource "aws_wafv2_web_acl" "static_assets" {
  count = var.environment == "production" ? 1 : 0
  name  = "${var.project_name}-static-assets-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate limiting rule
  rule {
    name     = "RateLimitRule"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit          = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }

    action {
      block {}
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}StaticAssetsWAF"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "${var.project_name}-static-assets-waf"
    Environment = var.environment
  }
}
