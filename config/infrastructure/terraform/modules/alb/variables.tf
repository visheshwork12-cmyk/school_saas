# ALB Module Variables - Advanced Features
# Comprehensive configuration for production-ready ALB

# ============================================================================
# BASIC CONFIGURATION
# ============================================================================

variable "name_prefix" {
  description = "Name prefix for all resources"
  type        = string
  validation {
    condition     = length(var.name_prefix) > 0 && length(var.name_prefix) <= 32
    error_message = "Name prefix must be between 1 and 32 characters."
  }
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "vpc_id" {
  description = "VPC ID where ALB will be created"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block for security group rules"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for ALB"
  type        = list(string)
  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "At least 2 subnet IDs are required for high availability."
  }
}

variable "internal" {
  description = "Boolean determining if ALB is internal"
  type        = bool
  default     = false
}

# ============================================================================
# SSL/TLS CONFIGURATION
# ============================================================================

variable "certificate_arn" {
  description = "ARN of SSL certificate for HTTPS listener"
  type        = string
}

variable "ssl_policy" {
  description = "SSL policy for HTTPS listener"
  type        = string
  default     = "ELBSecurityPolicy-TLS-1-2-2017-01"
  validation {
    condition = contains([
      "ELBSecurityPolicy-TLS-1-2-2017-01",
      "ELBSecurityPolicy-TLS-1-2-Ext-2018-06",
      "ELBSecurityPolicy-FS-1-2-Res-2020-10",
      "ELBSecurityPolicy-TLS-1-3-2021-06"
    ], var.ssl_policy)
    error_message = "SSL policy must be a valid ELB security policy."
  }
}

# ============================================================================
# TARGET GROUPS CONFIGURATION WITH STICKY SESSIONS
# ============================================================================

variable "target_groups" {
  description = "Map of target group configurations with sticky session support"
  type = map(object({
    port                        = number
    protocol                    = string
    target_type                = optional(string, "instance")
    deregistration_delay        = optional(number, 300)
    slow_start                  = optional(number, 0)
    load_balancing_algorithm    = optional(string, "round_robin")
    cross_zone_load_balancing   = optional(bool, true)
    
    # Sticky sessions configuration
    enable_stickiness           = optional(bool, false)
    stickiness_type            = optional(string, "lb_cookie") # lb_cookie, app_cookie
    stickiness_duration        = optional(number, 86400)      # 24 hours default
    stickiness_cookie_name     = optional(string, null)       # Required for app_cookie
    
    # Health check configuration
    health_check = object({
      enabled             = optional(bool, true)
      healthy_threshold   = optional(number, 2)
      unhealthy_threshold = optional(number, 2)
      timeout             = optional(number, 5)
      interval            = optional(number, 30)
      path                = optional(string, "/health")
      matcher             = optional(string, "200")
      protocol            = optional(string, "HTTP")
      port                = optional(string, "traffic-port")
    })
  }))
  
  default = {
    web = {
      port     = 80
      protocol = "HTTP"
      health_check = {
        path = "/health"
      }
    }
  }
}

variable "default_target_group_arn" {
  description = "ARN of default target group for ALB"
  type        = string
  default     = null
}

# ============================================================================
# LISTENER RULES CONFIGURATION
# ============================================================================

variable "listener_rules" {
  description = "Map of advanced listener rules for ALB"
  type = map(object({
    priority         = number
    action_type      = string # forward, redirect, fixed-response, authenticate-cognito, authenticate-oidc
    target_group_key = optional(string)
    
    # Conditions
    host_header   = optional(list(string))
    path_pattern  = optional(list(string))
    http_header   = optional(object({
      name   = string
      values = list(string)
    }))
    query_string  = optional(object({
      key   = string
      value = string
    }))
    
    # Actions
    redirect = optional(object({
      host        = optional(string)
      path        = optional(string)
      port        = optional(string)
      protocol    = optional(string)
      query       = optional(string)
      status_code = string
    }))
    
    fixed_response = optional(object({
      content_type = string
      message_body = string
      status_code  = string
    }))
  }))
  
  default = {}
}

# ============================================================================
# WAF INTEGRATION CONFIGURATION
# ============================================================================

variable "enable_waf" {
  description = "Enable AWS WAF integration"
  type        = bool
  default     = true
}

variable "waf_rate_limit" {
  description = "Rate limit for WAF (requests per 5 minutes per IP)"
  type        = number
  default     = 2000
  validation {
    condition     = var.waf_rate_limit >= 100 && var.waf_rate_limit <= 20000000
    error_message = "WAF rate limit must be between 100 and 20,000,000."
  }
}

variable "waf_excluded_rules" {
  description = "List of WAF managed rule names to exclude"
  type        = list(string)
  default     = []
}

variable "enable_geo_blocking" {
  description = "Enable geographic blocking in WAF"
  type        = bool
  default     = false
}

variable "blocked_countries" {
  description = "List of country codes to block (ISO 3166-1 alpha-2)"
  type        = list(string)
  default     = []
  validation {
    condition = alltrue([
      for country in var.blocked_countries : length(country) == 2
    ])
    error_message = "Country codes must be 2-character ISO 3166-1 alpha-2 codes."
  }
}

variable "waf_ip_sets" {
  description = "List of IP addresses/CIDR blocks for WAF IP set rules"
  type        = list(string)
  default     = []
}

variable "waf_ip_set_action" {
  description = "Action for IP set rule (allow or block)"
  type        = string
  default     = "block"
  validation {
    condition     = contains(["allow", "block"], var.waf_ip_set_action)
    error_message = "WAF IP set action must be 'allow' or 'block'."
  }
}

variable "enable_waf_logging" {
  description = "Enable WAF logging"
  type        = bool
  default     = true
}

variable "waf_log_destination" {
  description = "CloudWatch Logs group ARN for WAF logs"
  type        = string
  default     = ""
}

variable "waf_redacted_fields" {
  description = "List of header names to redact in WAF logs"
  type        = list(string)
  default     = ["authorization", "cookie"]
}

variable "enable_waf_detailed_logging" {
  description = "Enable detailed logging (log only blocked requests)"
  type        = bool
  default     = true
}

# ============================================================================
# CLOUDFRONT INTEGRATION
# ============================================================================

variable "enable_cloudfront_integration" {
  description = "Enable CloudFront integration with custom headers"
  type        = bool
  default     = false
}

variable "cloudfront_header_name" {
  description = "Custom header name for CloudFront verification"
  type        = string
  default     = "X-CloudFront-Secret"
}

variable "cloudfront_header_value" {
  description = "Custom header value for CloudFront verification (should be secret)"
  type        = string
  default     = ""
  sensitive   = true
}

# ============================================================================
# CUSTOM ERROR PAGES
# ============================================================================

variable "enable_custom_error_pages" {
  description = "Enable custom error pages"
  type        = bool
  default     = true
}

variable "custom_404_response" {
  description = "Custom 404 error page HTML content"
  type        = string
  default     = <<-HTML
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Page Not Found - School ERP</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
            h1 { color: #e74c3c; }
        </style>
    </head>
    <body>
        <h1>404 - Page Not Found</h1>
        <p>The requested page could not be found.</p>
        <p>Please check the URL or contact support.</p>
    </body>
    </html>
  HTML
}

variable "custom_error_pages" {
  description = "Map of custom error pages with different status codes"
  type = map(object({
    priority     = number
    status_code  = string
    content_type = string
    message_body = string
  }))
  
  default = {
    "503" = {
      priority     = 999
      status_code  = "503"
      content_type = "text/html"
      message_body = <<-HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Service Unavailable - School ERP</title>
            <style>body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }</style>
        </head>
        <body>
            <h1>503 - Service Temporarily Unavailable</h1>
            <p>We're performing scheduled maintenance. Please try again shortly.</p>
        </body>
        </html>
      HTML
    }
  }
}

# ============================================================================
# LOGGING AND MONITORING
# ============================================================================

variable "enable_access_logs" {
  description = "Enable ALB access logs"
  type        = bool
  default     = true
}

variable "enable_connection_logs" {
  description = "Enable ALB connection logs"
  type        = bool
  default     = false
}

variable "access_logs_bucket" {
  description = "S3 bucket name for ALB access logs"
  type        = string
  default     = ""
}

variable "enable_cloudwatch_alarms" {
  description = "Enable CloudWatch alarms for ALB"
  type        = bool
  default     = true
}

variable "cloudwatch_alarm_actions" {
  description = "List of ARN of actions to take when alarm triggers"
  type        = list(string)
  default     = []
}

variable "target_response_time_threshold" {
  description = "Threshold for target response time alarm (seconds)"
  type        = number
  default     = 1
}

variable "http_5xx_threshold" {
  description = "Threshold for HTTP 5xx errors alarm"
  type        = number
  default     = 10
}

variable "request_count_threshold" {
  description = "Threshold for high request count alarm (requests per minute)"
  type        = number
  default     = 10000
}

# ============================================================================
# TAGS
# ============================================================================

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
