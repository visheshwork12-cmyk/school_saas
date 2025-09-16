# Static Assets Cache Policy (Long TTL)
resource "aws_cloudfront_cache_policy" "static_assets_policy" {
  name        = "school-erp-static-assets-policy"
  comment     = "Cache policy for static assets (CSS, JS, Images)"
  default_ttl = 86400    # 24 hours
  max_ttl     = 31536000 # 1 year
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings {
        items = ["v", "version", "t"]
      }
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Accept", "Accept-Encoding", "CloudFront-Viewer-Country"]
      }
    }

    cookies_config {
      cookie_behavior = "none"
    }
  }
}

# API Cache Policy (Short TTL)
resource "aws_cloudfront_cache_policy" "api_cache_policy" {
  name        = "school-erp-api-cache-policy"
  comment     = "Cache policy for API responses"
  default_ttl = 300  # 5 minutes
  max_ttl     = 3600 # 1 hour
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    query_strings_config {
      query_string_behavior = "all"
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = [
          "Accept",
          "Accept-Encoding",
          "Authorization",
          "CloudFront-Viewer-Country",
          "User-Agent",
          "X-Tenant-ID",
          "X-School-ID"
        ]
      }
    }

    cookies_config {
      cookie_behavior = "whitelist"
      cookies {
        items = ["session_id", "auth_token"]
      }
    }
  }
}

# Documentation Cache Policy
resource "aws_cloudfront_cache_policy" "docs_cache_policy" {
  name        = "school-erp-docs-cache-policy"
  comment     = "Cache policy for API documentation"
  default_ttl = 3600  # 1 hour
  max_ttl     = 86400 # 24 hours
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    query_strings_config {
      query_string_behavior = "none"
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Accept", "Accept-Encoding"]
      }
    }

    cookies_config {
      cookie_behavior = "none"
    }
  }
}

# Images Cache Policy (Very Long TTL)
resource "aws_cloudfront_cache_policy" "images_policy" {
  name        = "school-erp-images-cache-policy"
  comment     = "Cache policy for images"
  default_ttl = 604800   # 7 days
  max_ttl     = 31536000 # 1 year
  min_ttl     = 86400    # 1 day

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = false
    enable_accept_encoding_gzip   = false

    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings {
        items = ["w", "h", "q", "format"]
      }
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Accept", "CloudFront-Viewer-Country"]
      }
    }

    cookies_config {
      cookie_behavior = "none"
    }
  }
}

# Fonts Cache Policy (Very Long TTL)
resource "aws_cloudfront_cache_policy" "fonts_policy" {
  name        = "school-erp-fonts-cache-policy"
  comment     = "Cache policy for web fonts"
  default_ttl = 2592000  # 30 days
  max_ttl     = 31536000 # 1 year
  min_ttl     = 86400    # 1 day

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = false
    enable_accept_encoding_gzip   = false

    query_strings_config {
      query_string_behavior = "none"
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Accept", "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
      }
    }

    cookies_config {
      cookie_behavior = "none"
    }
  }
}
