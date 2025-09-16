# Health Check Rule
resource "aws_lb_listener_rule" "health_check" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.health_check.arn
  }

  condition {
    path_pattern {
      values = ["/health*", "/status*"]
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-health-rule"
  })
}

# API Routes Rule
resource "aws_lb_listener_rule" "api_routes" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api_service.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-rule"
  })
}

# File Upload Rule with higher timeout
resource "aws_lb_listener_rule" "file_upload" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 300

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.file_service.arn
  }

  condition {
    path_pattern {
      values = ["/api/v1/files/*", "/uploads/*"]
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-files-rule"
  })
}

# Rate Limiting Rule for Auth endpoints
resource "aws_lb_listener_rule" "auth_rate_limit" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 150

  action {
    type = "fixed-response"

    fixed_response {
      content_type = "application/json"
      message_body = jsonencode({
        success = false
        error = {
          code = "RATE_LIMITED"
          message = "Too many authentication attempts"
        }
      })
      status_code = "429"
    }
  }

  condition {
    path_pattern {
      values = ["/api/v1/auth/*"]
    }
  }

  condition {
    http_header {
      http_header_name = "X-Rate-Limited"
      values          = ["true"]
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-auth-rate-limit"
  })
}
