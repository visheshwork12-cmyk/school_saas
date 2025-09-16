# API Origin Request Policy
resource "aws_cloudfront_origin_request_policy" "api_origin_policy" {
  name    = "school-erp-api-origin-policy"
  comment = "Origin request policy for API endpoints"

  query_strings_config {
    query_string_behavior = "all"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Accept",
        "Accept-Encoding",
        "Accept-Language",
        "Authorization",
        "CloudFront-Viewer-Country",
        "CloudFront-Viewer-Country-Region",
        "Content-Type",
        "Host",
        "Origin",
        "Referer",
        "User-Agent",
        "X-Forwarded-For",
        "X-Forwarded-Proto",
        "X-Real-IP",
        "X-Requested-With",
        "X-Tenant-ID",
        "X-School-ID",
        "X-API-Version",
        "X-Request-ID"
      ]
    }
  }

  cookies_config {
    cookie_behavior = "whitelist"
    cookies {
      items = ["session_id", "auth_token", "tenant_id", "preferences"]
    }
  }
}

# Static Assets Origin Request Policy
resource "aws_cloudfront_origin_request_policy" "static_origin_policy" {
  name    = "school-erp-static-origin-policy"
  comment = "Origin request policy for static assets"

  query_strings_config {
    query_string_behavior = "whitelist"
    query_strings {
      items = ["v", "version", "t"]
    }
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Accept",
        "Accept-Encoding",
        "CloudFront-Viewer-Country",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers"
      ]
    }
  }

  cookies_config {
    cookie_behavior = "none"
  }
}
