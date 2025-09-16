# ALB Module - Advanced Features Implementation
# Day 2: WAF Integration, CloudFront Support, Sticky Sessions, Custom Error Pages

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

locals {
  common_tags = {
    Module      = "ALB"
    Environment = var.environment
    Project     = var.name_prefix
    ManagedBy   = "Terraform"
    Service     = "SchoolERP"
  }
  
  # CloudFront IP ranges for security group
  cloudfront_prefix_list = "com.amazonaws.global.cloudfront.origin-facing"
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Get CloudFront prefix list for security group rules
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = local.cloudfront_prefix_list
}

# ============================================================================
# APPLICATION LOAD BALANCER
# ============================================================================

resource "aws_lb" "main" {
  name               = "${var.name_prefix}-alb"
  internal           = var.internal
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [aws_security_group.alb.id]

  # Advanced ALB Features
  enable_deletion_protection     = var.environment == "production" ? true : false
  enable_http2                  = true
  enable_cross_zone_load_balancing = true
  desync_mitigation_mode        = "defensive"
  
  # WAF Association - Will be created separately
  enable_waf_fail_open = false

  # Access logs
  access_logs {
    bucket  = var.access_logs_bucket
    prefix  = "alb-logs/${var.environment}"
    enabled = var.enable_access_logs
  }

  # Connection logs  
  connection_logs {
    bucket  = var.access_logs_bucket
    prefix  = "alb-connection-logs/${var.environment}"
    enabled = var.enable_connection_logs
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-alb"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# SECURITY GROUP FOR ALB
# ============================================================================

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb-sg"
  description = "Security group for ALB with CloudFront integration"
  vpc_id      = var.vpc_id

  # HTTP access - Only for redirects
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.internal ? [var.vpc_cidr] : ["0.0.0.0/0"]
    description = "HTTP access"
  }

  # HTTPS access - Primary traffic
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.internal ? [var.vpc_cidr] : ["0.0.0.0/0"]
    description = "HTTPS access"
  }

  # CloudFront access (if enabled)
  dynamic "ingress" {
    for_each = var.enable_cloudfront_integration ? [1] : []
    content {
      from_port       = 443
      to_port         = 443
      protocol        = "tcp"
      prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
      description     = "HTTPS access from CloudFront"
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-alb-sg"
  })
}

# ============================================================================
# ALB LISTENERS
# ============================================================================

# HTTP Listener - Redirect to HTTPS
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = local.common_tags
}

# HTTPS Listener - Main listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.certificate_arn

  # Default action - Custom error page or forward
  default_action {
    type = var.enable_custom_error_pages ? "fixed-response" : "forward"
    
    dynamic "fixed_response" {
      for_each = var.enable_custom_error_pages ? [1] : []
      content {
        content_type = "text/html"
        status_code  = "404"
        message_body = var.custom_404_response
      }
    }

    dynamic "forward" {
      for_each = var.enable_custom_error_pages ? [] : [1]
      content {
        target_group {
          arn = var.default_target_group_arn
        }
      }
    }
  }

  tags = local.common_tags
}

# ============================================================================
# TARGET GROUPS WITH STICKY SESSIONS
# ============================================================================

resource "aws_lb_target_group" "main" {
  for_each = var.target_groups

  name     = "${var.name_prefix}-${each.key}-tg"
  port     = each.value.port
  protocol = each.value.protocol
  vpc_id   = var.vpc_id

  # Health check configuration
  health_check {
    enabled             = true
    healthy_threshold   = each.value.health_check.healthy_threshold
    unhealthy_threshold = each.value.health_check.unhealthy_threshold
    timeout             = each.value.health_check.timeout
    interval            = each.value.health_check.interval
    path                = each.value.health_check.path
    matcher             = each.value.health_check.matcher
    protocol            = each.value.health_check.protocol
    port                = each.value.health_check.port
  }

  # Advanced target group attributes
  target_type                       = each.value.target_type
  deregistration_delay              = each.value.deregistration_delay
  slow_start                        = each.value.slow_start
  load_balancing_algorithm_type     = each.value.load_balancing_algorithm
  load_balancing_cross_zone_enabled = each.value.cross_zone_load_balancing

  # Sticky sessions configuration
  dynamic "stickiness" {
    for_each = each.value.enable_stickiness ? [1] : []
    content {
      type            = each.value.stickiness_type
      cookie_duration = each.value.stickiness_duration
      enabled         = true
      
      # Application-controlled stickiness
      cookie_name = each.value.stickiness_type == "app_cookie" ? each.value.stickiness_cookie_name : null
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-${each.key}-tg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# LISTENER RULES - Advanced Routing
# ============================================================================

# Main application routing rules
resource "aws_lb_listener_rule" "main" {
  for_each = var.listener_rules

  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.priority

  # Conditions
  dynamic "condition" {
    for_each = each.value.host_header != null ? [each.value.host_header] : []
    content {
      host_header {
        values = condition.value
      }
    }
  }

  dynamic "condition" {
    for_each = each.value.path_pattern != null ? [each.value.path_pattern] : []
    content {
      path_pattern {
        values = condition.value
      }
    }
  }

  dynamic "condition" {
    for_each = each.value.http_header != null ? [each.value.http_header] : []
    content {
      http_header {
        http_header_name = condition.value.name
        values           = condition.value.values
      }
    }
  }

  dynamic "condition" {
    for_each = each.value.query_string != null ? [each.value.query_string] : []
    content {
      query_string {
        key   = condition.value.key
        value = condition.value.value
      }
    }
  }

  # Actions
  dynamic "action" {
    for_each = each.value.action_type == "forward" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.main[each.value.target_group_key].arn
    }
  }

  dynamic "action" {
    for_each = each.value.action_type == "redirect" ? [1] : []
    content {
      type = "redirect"
      redirect {
        host        = each.value.redirect.host
        path        = each.value.redirect.path
        port        = each.value.redirect.port
        protocol    = each.value.redirect.protocol
        query       = each.value.redirect.query
        status_code = each.value.redirect.status_code
      }
    }
  }

  dynamic "action" {
    for_each = each.value.action_type == "fixed-response" ? [1] : []
    content {
      type = "fixed-response"
      fixed_response {
        content_type = each.value.fixed_response.content_type
        message_body = each.value.fixed_response.message_body
        status_code  = each.value.fixed_response.status_code
      }
    }
  }

  tags = local.common_tags
}

# CloudFront verification rule (if enabled)
resource "aws_lb_listener_rule" "cloudfront_verification" {
  count = var.enable_cloudfront_integration ? 1 : 0

  listener_arn = aws_lb_listener.https.arn
  priority     = 1  # Highest priority

  condition {
    http_header {
      http_header_name = var.cloudfront_header_name
      values           = [var.cloudfront_header_value]
    }
  }

  action {
    type             = "forward"
    target_group_arn = var.default_target_group_arn
  }

  tags = merge(local.common_tags, {
    Name = "CloudFront-Verification-Rule"
  })
}

# Custom error pages for different status codes
resource "aws_lb_listener_rule" "error_pages" {
  for_each = var.enable_custom_error_pages ? var.custom_error_pages : {}

  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.priority

  # This would typically be used with health check failures
  condition {
    http_request_method {
      values = ["GET", "POST", "PUT", "DELETE", "PATCH"]
    }
  }

  action {
    type = "fixed-response"
    fixed_response {
      content_type = each.value.content_type
      message_body = each.value.message_body
      status_code  = each.value.status_code
    }
  }

  tags = merge(local.common_tags, {
    Name = "Error-Page-${each.key}"
  })
}

# ============================================================================
# WAF INTEGRATION
# ============================================================================

# WAF Web ACL
resource "aws_wafv2_web_acl" "main" {
  count = var.enable_waf ? 1 : 0

  name        = "${var.name_prefix}-waf"
  description = "WAF for ${var.name_prefix} ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # AWS Managed Rules - Core Rule Set
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"

        # Exclude rules if needed
        dynamic "rule_action_override" {
          for_each = var.waf_excluded_rules
          content {
            action_to_use {
              allow {}
            }
            name = rule_action_override.value
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWS-AWSManagedRulesCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules - Known Bad Inputs
  rule {
    name     = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Rate limiting rule
  rule {
    name     = "RateLimitRule"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }

  # Custom rules for geo-blocking (if enabled)
  dynamic "rule" {
    for_each = var.enable_geo_blocking ? [1] : []
    content {
      name     = "GeoBlockingRule"
      priority = 4

      action {
        block {}
      }

      statement {
        geo_match_statement {
          country_codes = var.blocked_countries
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "GeoBlockingRule"
        sampled_requests_enabled   = true
      }
    }
  }

  # Custom IP whitelist/blacklist rules
  dynamic "rule" {
    for_each = length(var.waf_ip_sets) > 0 ? [1] : []
    content {
      name     = "IPSetRule"
      priority = 5

      action {
        dynamic "allow" {
          for_each = var.waf_ip_set_action == "allow" ? [1] : []
          content {}
        }
        
        dynamic "block" {
          for_each = var.waf_ip_set_action == "block" ? [1] : []
          content {}
        }
      }

      statement {
        ip_set_reference_statement {
          arn = aws_wafv2_ip_set.main[0].arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "IPSetRule"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-WAF"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

# IP Set for WAF (if IP-based rules are needed)
resource "aws_wafv2_ip_set" "main" {
  count = var.enable_waf && length(var.waf_ip_sets) > 0 ? 1 : 0

  name         = "${var.name_prefix}-ip-set"
  description  = "IP set for ${var.name_prefix}"
  scope        = "REGIONAL"
  ip_address_version = "IPV4"

  addresses = var.waf_ip_sets

  tags = local.common_tags
}

# Associate WAF with ALB
resource "aws_wafv2_web_acl_association" "main" {
  count = var.enable_waf ? 1 : 0

  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main[0].arn

  depends_on = [
    aws_lb.main,
    aws_wafv2_web_acl.main
  ]
}

# WAF Logging Configuration
resource "aws_wafv2_web_acl_logging_configuration" "main" {
  count = var.enable_waf && var.enable_waf_logging ? 1 : 0

  resource_arn            = aws_wafv2_web_acl.main[0].arn
  log_destination_configs = [var.waf_log_destination]

  dynamic "redacted_fields" {
    for_each = var.waf_redacted_fields
    content {
      single_header {
        name = redacted_fields.value
      }
    }
  }

  dynamic "logging_filter" {
    for_each = var.enable_waf_detailed_logging ? [1] : []
    content {
      default_behavior = "KEEP"

      filter {
        behavior = "KEEP"
        condition {
          action_condition {
            action = "BLOCK"
          }
        }
        requirement = "MEETS_ALL"
      }
    }
  }
}

# ============================================================================
# CLOUDWATCH ALARMS
# ============================================================================

# Target response time alarm
resource "aws_cloudwatch_metric_alarm" "target_response_time" {
  for_each = var.enable_cloudwatch_alarms ? var.target_groups : {}

  alarm_name          = "${var.name_prefix}-${each.key}-high-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "TargetResponseTime"
  namespace          = "AWS/ApplicationELB"
  period             = "60"
  statistic          = "Average"
  threshold          = var.target_response_time_threshold
  alarm_description  = "This metric monitors ALB target response time"
  alarm_actions      = var.cloudwatch_alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.main[each.key].arn_suffix
  }

  tags = local.common_tags
}

# HTTP 5xx errors alarm
resource "aws_cloudwatch_metric_alarm" "http_5xx_errors" {
  count = var.enable_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-alb-http-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "HTTPCode_ELB_5XX_Count"
  namespace          = "AWS/ApplicationELB"
  period             = "60"
  statistic          = "Sum"
  threshold          = var.http_5xx_threshold
  alarm_description  = "This metric monitors ALB 5xx errors"
  alarm_actions      = var.cloudwatch_alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = local.common_tags
}

# Request count alarm (for DDoS detection)
resource "aws_cloudwatch_metric_alarm" "request_count" {
  count = var.enable_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-alb-high-request-count"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "RequestCount"
  namespace          = "AWS/ApplicationELB"
  period             = "60"
  statistic          = "Sum"
  threshold          = var.request_count_threshold
  alarm_description  = "This metric monitors ALB request count"
  alarm_actions      = var.cloudwatch_alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = local.common_tags
}
