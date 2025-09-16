# ALB Module Outputs
# Comprehensive outputs for integration with other modules

# ============================================================================
# BASIC ALB OUTPUTS
# ============================================================================

output "alb_id" {
  description = "The ID of the load balancer"
  value       = aws_lb.main.id
}

output "alb_arn" {
  description = "The ARN of the load balancer"
  value       = aws_lb.main.arn
}

output "alb_arn_suffix" {
  description = "The ARN suffix for use with CloudWatch Metrics"
  value       = aws_lb.main.arn_suffix
}

output "alb_dns_name" {
  description = "The DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "alb_canonical_hosted_zone_id" {
  description = "The canonical hosted zone ID of the load balancer (to be used in a Route 53 Alias record)"
  value       = aws_lb.main.zone_id
}

output "alb_hosted_zone_id" {
  description = "The zone ID of the load balancer"
  value       = aws_lb.main.zone_id
}

# ============================================================================
# SECURITY GROUP OUTPUTS
# ============================================================================

output "alb_security_group_id" {
  description = "The ID of the security group attached to the load balancer"
  value       = aws_security_group.alb.id
}

output "alb_security_group_arn" {
  description = "The ARN of the security group attached to the load balancer"
  value       = aws_security_group.alb.arn
}

# ============================================================================
# LISTENER OUTPUTS
# ============================================================================

output "http_listener_arn" {
  description = "The ARN of the HTTP listener"
  value       = aws_lb_listener.http.arn
}

output "https_listener_arn" {
  description = "The ARN of the HTTPS listener"
  value       = aws_lb_listener.https.arn
}

output "listener_arns" {
  description = "Map of all listener ARNs"
  value = {
    http  = aws_lb_listener.http.arn
    https = aws_lb_listener.https.arn
  }
}

# ============================================================================
# TARGET GROUP OUTPUTS
# ============================================================================

output "target_group_arns" {
  description = "Map of target group ARNs"
  value = {
    for k, v in aws_lb_target_group.main : k => v.arn
  }
}

output "target_group_arn_suffixes" {
  description = "Map of target group ARN suffixes for CloudWatch"
  value = {
    for k, v in aws_lb_target_group.main : k => v.arn_suffix
  }
}

output "target_group_names" {
  description = "Map of target group names"
  value = {
    for k, v in aws_lb_target_group.main : k => v.name
  }
}

output "target_group_health_check_paths" {
  description = "Map of target group health check paths"
  value = {
    for k, v in aws_lb_target_group.main : k => v.health_check[0].path
  }
}

# ============================================================================
# WAF OUTPUTS
# ============================================================================

output "waf_web_acl_id" {
  description = "The ID of the WAF Web ACL"
  value       = var.enable_waf ? aws_wafv2_web_acl.main[0].id : null
}

output "waf_web_acl_arn" {
  description = "The ARN of the WAF Web ACL"
  value       = var.enable_waf ? aws_wafv2_web_acl.main[0].arn : null
}

output "waf_web_acl_capacity" {
  description = "The capacity units used by the WAF Web ACL"
  value       = var.enable_waf ? aws_wafv2_web_acl.main[0].capacity : null
}

output "waf_ip_set_id" {
  description = "The ID of the WAF IP Set"
  value       = var.enable_waf && length(var.waf_ip_sets) > 0 ? aws_wafv2_ip_set.main[0].id : null
}

output "waf_ip_set_arn" {
  description = "The ARN of the WAF IP Set"
  value       = var.enable_waf && length(var.waf_ip_sets) > 0 ? aws_wafv2_ip_set.main[0].arn : null
}

# ============================================================================
# CLOUDFRONT INTEGRATION OUTPUTS
# ============================================================================

output "cloudfront_origin_config" {
  description = "CloudFront origin configuration for this ALB"
  value = var.enable_cloudfront_integration ? {
    domain_name = aws_lb.main.dns_name
    origin_id   = "${var.name_prefix}-alb-origin"
    custom_origin_config = {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_keepalive_timeout = 5
      origin_read_timeout      = 30
    }
    custom_header = {
      name  = var.cloudfront_header_name
      value = var.cloudfront_header_value
    }
  } : null
}

output "cloudfront_distribution_config" {
  description = "Suggested CloudFront distribution configuration"
  value = var.enable_cloudfront_integration ? {
    aliases = [] # Add your domains here
    
    default_cache_behavior = {
      target_origin_id         = "${var.name_prefix}-alb-origin"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods         = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods          = ["GET", "HEAD"]
      compress                = true
      cache_policy_id         = "managed-caching-disabled" # For dynamic content
      origin_request_policy_id = "managed-cors-s3-origin"
    }
    
    restrictions = {
      geo_restriction = {
        restriction_type = "none"
      }
    }
    
    viewer_certificate = {
      acm_certificate_arn      = var.certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  } : null
}

# ============================================================================
# MONITORING OUTPUTS
# ============================================================================

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for ALB logs"
  value       = var.enable_access_logs ? "${var.name_prefix}-alb-access-logs" : null
}

output "cloudwatch_alarm_arns" {
  description = "Map of CloudWatch alarm ARNs"
  value = var.enable_cloudwatch_alarms ? {
    target_response_time = [for alarm in aws_cloudwatch_metric_alarm.target_response_time : alarm.arn]
    http_5xx_errors     = length(aws_cloudwatch_metric_alarm.http_5xx_errors) > 0 ? aws_cloudwatch_metric_alarm.http_5xx_errors[0].arn : null
    request_count       = length(aws_cloudwatch_metric_alarm.request_count) > 0 ? aws_cloudwatch_metric_alarm.request_count[0].arn : null
  } : {}
}

# ============================================================================
# CONFIGURATION SUMMARY OUTPUTS
# ============================================================================

output "alb_configuration_summary" {
  description = "Summary of ALB configuration"
  value = {
    name                    = aws_lb.main.name
    dns_name               = aws_lb.main.dns_name
    scheme                 = aws_lb.main.internal ? "internal" : "internet-facing"
    type                   = aws_lb.main.load_balancer_type
    subnets                = aws_lb.main.subnets
    security_groups        = aws_lb.main.security_groups
    
    # Feature flags
    waf_enabled            = var.enable_waf
    cloudfront_integration = var.enable_cloudfront_integration
    custom_error_pages     = var.enable_custom_error_pages
    access_logs_enabled    = var.enable_access_logs
    
    # Target groups summary
    target_groups_count    = length(var.target_groups)
    sticky_sessions_enabled = [
      for k, v in var.target_groups : k if v.enable_stickiness == true
    ]
    
    # Listeners
    listeners = {
      http_redirect_to_https = true
      https_ssl_policy       = var.ssl_policy
      certificate_arn        = var.certificate_arn
    }
  }
}

output "integration_endpoints" {
  description = "Integration endpoints for other services"
  value = {
    # For application deployment
    target_group_arns = [for tg in aws_lb_target_group.main : tg.arn]
    
    # For Route 53 alias records
    route53_alias = {
      name    = aws_lb.main.dns_name
      zone_id = aws_lb.main.zone_id
    }
    
    # For CloudFront origins
    cloudfront_origin = var.enable_cloudfront_integration ? {
      domain_name = aws_lb.main.dns_name
      headers = {
        name  = var.cloudfront_header_name
        value = var.cloudfront_header_value
      }
    } : null
    
    # For monitoring dashboards
    monitoring = {
      alb_arn_suffix = aws_lb.main.arn_suffix
      target_group_arn_suffixes = {
        for k, v in aws_lb_target_group.main : k => v.arn_suffix
      }
    }
  }
}
