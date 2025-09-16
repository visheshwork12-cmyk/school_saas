# Security Headers for API Responses
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "school-erp-security-headers"
  comment = "Security headers for API responses"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                   = true
    }
    
    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; object-src 'none';"
      override = true
    }
    
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    
    content_type_options {
      override = true
    }
    
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "X-Powered-By"
      value    = "School-ERP-SaaS"
      override = true
    }
    
    items {
      header   = "X-Content-Type-Options"
      value    = "nosniff"
      override = true
    }
    
    items {
      header   = "X-XSS-Protection"
      value    = "1; mode=block"
      override = true
    }
    
    items {
      header   = "Permissions-Policy"
      value    = "geolocation=(), microphone=(), camera=()"
      override = true
    }
  }

  cors_config {
    access_control_allow_credentials = true
    access_control_max_age_sec      = 86400
    
    access_control_allow_headers {
      items = [
        "Accept",
        "Accept-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-Tenant-ID",
        "X-School-ID",
        "X-API-Version"
      ]
    }
    
    access_control_allow_methods {
      items = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]
    }
    
    access_control_allow_origins {
      items = var.cors_allowed_origins
    }
    
    origin_override = true
  }
}

# Headers for Static Assets
resource "aws_cloudfront_response_headers_policy" "static_assets_headers" {
  name    = "school-erp-static-assets-headers"
  comment = "Headers for static assets"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                   = true
    }
    
    content_type_options {
      override = true
    }
  }

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public, max-age=31536000, immutable"
      override = true
    }
    
    items {
      header   = "X-Content-Type-Options"
      value    = "nosniff"
      override = true
    }
  }

  cors_config {
    access_control_allow_credentials = false
    access_control_max_age_sec      = 86400
    
    access_control_allow_headers {
      items = ["Accept", "Accept-Language", "Content-Type"]
    }
    
    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }
    
    access_control_allow_origins {
      items = ["*"]
    }
    
    origin_override = true
  }
}

# Headers for Documentation
resource "aws_cloudfront_response_headers_policy" "docs_headers" {
  name    = "school-erp-docs-headers"
  comment = "Headers for API documentation"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                   = true
    }
    
    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com;"
      override = true
    }
    
    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }
    
    content_type_options {
      override = true
    }
  }

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public, max-age=3600"
      override = true
    }
  }
}

# Headers for Images
resource "aws_cloudfront_response_headers_policy" "images_headers" {
  name    = "school-erp-images-headers"
  comment = "Headers for images"

  security_headers_config {
    content_type_options {
      override = true
    }
  }

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public, max-age=604800, immutable"
      override = true
    }
    
    items {
      header   = "Vary"
      value    = "Accept"
      override = true
    }
  }
}

# Headers for Fonts
resource "aws_cloudfront_response_headers_policy" "fonts_headers" {
  name    = "school-erp-fonts-headers"
  comment = "Headers for web fonts"

  security_headers_config {
    content_type_options {
      override = true
    }
  }

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public, max-age=2592000, immutable"
      override = true
    }
    
    items {
      header   = "Access-Control-Allow-Origin"
      value    = "*"
      override = true
    }
  }
}
