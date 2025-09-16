# infrastructure/terraform/cloudfront.tf

locals {
  s3_origin_id = "school-erp-s3-origin"
  api_origin_id = "school-erp-api-origin"
  
  cache_behaviors = {
    static_assets = {
      path_pattern = "/assets/*"
      ttl = 86400  # 24 hours
      compress = true
    }
    api_docs = {
      path_pattern = "/api-docs/*"
      ttl = 3600   # 1 hour
      compress = true
    }
    images = {
      path_pattern = "/images/*"
      ttl = 604800  # 7 days
      compress = true
    }
    fonts = {
      path_pattern = "/fonts/*"
      ttl = 2592000  # 30 days
      compress = false
    }
  }
}

# Origin Access Control for S3
resource "aws_cloudfront_origin_access_control" "school_erp_oac" {
  name                              = "school-erp-s3-oac"
  description                       = "Origin Access Control for School ERP static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "school_erp_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.environment == "production" ? "PriceClass_All" : "PriceClass_100"
  
  # Aliases (Custom Domain Names)
  aliases = var.environment == "production" ? [
    "cdn.schoolerp.com",
    "assets.schoolerp.com"
  ] : ["cdn-staging.schoolerp.com"]

  # S3 Static Assets Origin
  origin {
    domain_name              = aws_s3_bucket.static_assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.school_erp_oac.id
    origin_id                = local.s3_origin_id
    origin_path              = "/static"

    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_verification_secret
    }
  }

  # API/Application Origin
  origin {
    domain_name = var.api_domain_name
    origin_id   = local.api_origin_id
    
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_keepalive_timeout = 5
      origin_read_timeout      = 30
    }

    custom_header {
      name  = "X-Forwarded-Host"
      value = var.api_domain_name
    }
    
    custom_header {
      name  = "X-CloudFront-Request"
      value = "true"
    }
  }

  # Default Cache Behavior (API/Dynamic Content)
  default_cache_behavior {
    allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    target_origin_id           = local.api_origin_id
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"

    # Cache Policy for API responses
    cache_policy_id = aws_cloudfront_cache_policy.api_cache_policy.id
    
    # Origin Request Policy
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_origin_policy.id
    
    # Response Headers Policy
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
  }

  # Static Assets Cache Behavior
  ordered_cache_behavior {
    path_pattern               = "/static/*"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = local.s3_origin_id
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"

    cache_policy_id = aws_cloudfront_cache_policy.static_assets_policy.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.static_assets_headers.id
  }

  # API Documentation Cache Behavior
  ordered_cache_behavior {
    path_pattern               = "/api-docs/*"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = local.api_origin_id
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"

    cache_policy_id = aws_cloudfront_cache_policy.docs_cache_policy.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.docs_headers.id
  }

  # Images Cache Behavior
  ordered_cache_behavior {
    path_pattern               = "/images/*"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = local.s3_origin_id
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"

    cache_policy_id = aws_cloudfront_cache_policy.images_policy.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.images_headers.id
  }

  # Fonts Cache Behavior
  ordered_cache_behavior {
    path_pattern               = "/fonts/*"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = local.s3_origin_id
    compress                   = false
    viewer_protocol_policy     = "redirect-to-https"

    cache_policy_id = aws_cloudfront_cache_policy.fonts_policy.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.fonts_headers.id
  }

  # Geographic Restrictions
  restrictions {
    geo_restriction {
      restriction_type = var.geo_restriction_enabled ? "whitelist" : "none"
      locations        = var.allowed_countries
    }
  }

  # SSL Certificate
  viewer_certificate {
    acm_certificate_arn            = var.ssl_certificate_arn
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
    cloudfront_default_certificate = var.ssl_certificate_arn == "" ? true : false
  }

  # Custom Error Pages
  dynamic "custom_error_response" {
    for_each = local.error_responses
    content {
      error_code            = custom_error_response.value.error_code
      response_code         = custom_error_response.value.response_code
      response_page_path    = custom_error_response.value.response_page_path
      error_caching_min_ttl = custom_error_response.value.error_caching_min_ttl
    }
  }

  # Logging Configuration
  logging_config {
    include_cookies = false
    bucket          = aws_s3_bucket.cloudfront_logs.bucket_domain_name
    prefix          = "access-logs/"
  }

  # Web ACL Association
  web_acl_id = var.waf_web_acl_id

  tags = {
    Name        = "school-erp-cloudfront-${var.environment}"
    Environment = var.environment
    Project     = "school-erp-saas"
    ManagedBy   = "terraform"
  }
}

# Custom Error Responses Configuration
locals {
  error_responses = [
    {
      error_code            = 403
      response_code         = 404
      response_page_path    = "/404.html"
      error_caching_min_ttl = 300
    },
    {
      error_code            = 404
      response_code         = 404
      response_page_path    = "/404.html"
      error_caching_min_ttl = 300
    },
    {
      error_code            = 500
      response_code         = 500
      response_page_path    = "/500.html"
      error_caching_min_ttl = 0
    },
    {
      error_code            = 502
      response_code         = 502
      response_page_path    = "/502.html"
      error_caching_min_ttl = 0
    },
    {
      error_code            = 503
      response_code         = 503
      response_page_path    = "/503.html"
      error_caching_min_ttl = 0
    },
    {
      error_code            = 504
      response_code         = 504
      response_page_path    = "/504.html"
      error_caching_min_ttl = 0
    }
  ]
}
