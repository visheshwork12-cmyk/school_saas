#!/bin/bash
# scripts/verify-deployment.sh - Comprehensive deployment verification

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration
TARGET_URL=${1:-}
ENVIRONMENT=${2:-staging}
TIMEOUT=${TIMEOUT:-300}
VERBOSE=${VERBOSE:-false}
COMPREHENSIVE=${COMPREHENSIVE:-false}

# Verification results
declare -A VERIFICATION_RESULTS
declare -a FAILED_CHECKS
TOTAL_CHECKS=0
PASSED_CHECKS=0

log() {
    local level=$1
    shift
    local message="$*"
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} ${message}" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} ${message}" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${message}" ;;
        DEBUG) [[ "$VERBOSE" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} ${message}" ;;
        SUCCESS) echo -e "${GREEN}[✅]${NC} ${message}" ;;
        FAIL) echo -e "${RED}[❌]${NC} ${message}" ;;
        *) echo -e "${message}" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║               🔍 DEPLOYMENT VERIFIER                        ║
║           School ERP SaaS - Health & Quality Check          ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Target: ${TARGET_URL:-Auto-detect}"
    echo "Environment: $ENVIRONMENT"
    echo "Timeout: ${TIMEOUT}s"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 [url] [environment] [options]

ARGUMENTS:
    url           Target URL to verify (auto-detected if not provided)
    environment   Environment to verify (default: staging)

OPTIONS:
    --timeout SECS     Verification timeout in seconds (default: 300)
    --comprehensive    Run comprehensive verification suite
    --verbose          Enable verbose logging
    --help             Show this help message

EXAMPLES:
    $0 https://api.school-erp.com production
    $0 http://localhost:3000 development --comprehensive
    $0 --verbose

ENVIRONMENT VARIABLES:
    TIMEOUT            Verification timeout (seconds)
    VERBOSE            Enable verbose mode (true/false)
    COMPREHENSIVE      Run comprehensive checks (true/false)
EOF
}

detect_target_url() {
    log DEBUG "🔍 Auto-detecting target URL..."
    
    # Check for running local server
    if curl -s --max-time 2 http://localhost:3000/health &>/dev/null; then
        echo "http://localhost:3000"
        return 0
    fi
    
    # Check for Docker container
    if docker ps --format "table {{.Names}}" | grep -q school-erp; then
        local docker_port=$(docker port school-erp-container 3000 2>/dev/null | cut -d: -f2 || echo "3000")
        echo "http://localhost:$docker_port"
        return 0
    fi
    
    # Check for Kubernetes service
    if command -v kubectl &> /dev/null && kubectl get svc school-erp-service -n school-erp &>/dev/null; then
        local k8s_port=$(kubectl get svc school-erp-service -n school-erp -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "30080")
        echo "http://localhost:$k8s_port"
        return 0
    fi
    
    # Check for Vercel deployment
    if [[ -n "${VERCEL_URL:-}" ]]; then
        echo "https://$VERCEL_URL"
        return 0
    fi
    
    # Default
    echo "http://localhost:3000"
}

run_check() {
    local check_name="$1"
    local check_function="$2"
    local critical="${3:-false}"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    log INFO "🔍 $check_name..."
    
    local start_time=$(date +%s)
    local result
    
    if result=$($check_function 2>&1); then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        VERIFICATION_RESULTS["$check_name"]="PASS:$duration:$result"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        log SUCCESS "$check_name (${duration}s)"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        VERIFICATION_RESULTS["$check_name"]="FAIL:$duration:$result"
        FAILED_CHECKS+=("$check_name")
        
        if [[ "$critical" == "true" ]]; then
            log FAIL "$check_name (${duration}s) - CRITICAL"
        else
            log FAIL "$check_name (${duration}s)"
        fi
        
        [[ "$VERBOSE" == "true" ]] && log DEBUG "Error: $result"
        return 1
    fi
}

check_basic_connectivity() {
    curl -f --max-time 10 --silent --head "$TARGET_URL" >/dev/null
    echo "Basic connectivity working"
}

check_health_endpoint() {
    local response=$(curl -f --max-time 10 --silent "$TARGET_URL/health")
    local status=$(echo "$response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
    
    if [[ "$status" == "healthy" ]]; then
        echo "Health endpoint: $status"
    else
        return 1
    fi
}

check_api_endpoints() {
    local endpoints=(
        "/health"
        "/status"
        "/api/v1"
    )
    
    local working_endpoints=0
    local total_endpoints=${#endpoints[@]}
    
    for endpoint in "${endpoints[@]}"; do
        if curl -f --max-time 5 --silent "$TARGET_URL$endpoint" >/dev/null 2>&1; then
            working_endpoints=$((working_endpoints + 1))
        fi
    done
    
    if [[ $working_endpoints -eq $total_endpoints ]]; then
        echo "All $total_endpoints API endpoints working"
    else
        echo "Only $working_endpoints/$total_endpoints endpoints working"
        return 1
    fi
}

check_database_connectivity() {
    local health_response=$(curl -f --max-time 10 --silent "$TARGET_URL/health" 2>/dev/null || echo "{}")
    local db_status=$(echo "$health_response" | jq -r '.database.status // .system.database // "unknown"' 2>/dev/null || echo "unknown")
    
    if [[ "$db_status" == "connected" ]] || [[ "$db_status" == "healthy" ]]; then
        echo "Database: $db_status"
    else
        echo "Database status: $db_status"
        return 1
    fi
}

check_authentication() {
    # Test authentication endpoint
    local auth_response=$(curl -f --max-time 10 --silent "$TARGET_URL/api/v1/auth/health" 2>/dev/null || echo "{}")
    
    if [[ -n "$auth_response" ]] && echo "$auth_response" | jq -e . >/dev/null 2>&1; then
        echo "Authentication service responding"
    else
        return 1
    fi
}

check_response_time() {
    local total_time=$(curl -o /dev/null -s -w '%{time_total}' --max-time 30 "$TARGET_URL/health")
    local time_ms=$(echo "$total_time * 1000" | bc 2>/dev/null || echo "0")
    
    if (( $(echo "$total_time < 2.0" | bc -l 2>/dev/null || echo 0) )); then
        echo "Response time: ${time_ms}ms (good)"
    elif (( $(echo "$total_time < 5.0" | bc -l 2>/dev/null || echo 0) )); then
        echo "Response time: ${time_ms}ms (acceptable)"
    else
        echo "Response time: ${time_ms}ms (slow)"
        return 1
    fi
}

check_ssl_certificate() {
    if [[ "$TARGET_URL" =~ ^https:// ]]; then
        local domain=$(echo "$TARGET_URL" | sed 's|https://||' | cut -d'/' -f1)
        local ssl_info=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
        
        if [[ -n "$ssl_info" ]]; then
            local expiry=$(echo "$ssl_info" | grep "notAfter" | cut -d'=' -f2)
            echo "SSL certificate valid until: $expiry"
        else
            return 1
        fi
    else
        echo "HTTP endpoint - SSL not applicable"
    fi
}

check_security_headers() {
    local headers=$(curl -I --max-time 10 --silent "$TARGET_URL/health" 2>/dev/null || echo "")
    local security_headers=("X-Content-Type-Options" "X-Frame-Options" "X-XSS-Protection")
    local present_headers=0
    
    for header in "${security_headers[@]}"; do
        if echo "$headers" | grep -qi "$header"; then
            present_headers=$((present_headers + 1))
        fi
    done
    
    if [[ $present_headers -gt 0 ]]; then
        echo "Security headers: $present_headers/${#security_headers[@]} present"
    else
        echo "No security headers found"
        return 1
    fi
}

check_api_documentation() {
    if curl -f --max-time 5 --silent "$TARGET_URL/api-docs.json" >/dev/null 2>&1; then
        echo "API documentation available"
    else
        echo "API documentation not available"
        return 1
    fi
}

check_cors_configuration() {
    local cors_response=$(curl -H "Origin: https://example.com" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: X-Requested-With" -X OPTIONS --max-time 10 --silent -I "$TARGET_URL/health" 2>/dev/null || echo "")
    
    if echo "$cors_response" | grep -qi "Access-Control-Allow-Origin"; then
        echo "CORS configured"
    else
        echo "CORS not configured"
        return 1
    fi
}

check_rate_limiting() {
    local rate_limit_response=$(curl -I --max-time 5 --silent "$TARGET_URL/health" 2>/dev/null || echo "")
    
    if echo "$rate_limit_response" | grep -qi "X-RateLimit"; then
        echo "Rate limiting active"
    else
        echo "Rate limiting not detected"
        return 1
    fi
}

check_monitoring_endpoints() {
    local monitoring_endpoints=("/metrics" "/health" "/status")
    local available_endpoints=0
    
    for endpoint in "${monitoring_endpoints[@]}"; do
        if curl -f --max-time 5 --silent "$TARGET_URL$endpoint" >/dev/null 2>&1; then
            available_endpoints=$((available_endpoints + 1))
        fi
    done
    
    if [[ $available_endpoints -gt 0 ]]; then
        echo "Monitoring endpoints: $available_endpoints/${#monitoring_endpoints[@]} available"
    else
        echo "No monitoring endpoints available"
        return 1
    fi
}

run_load_test() {
    if ! command -v ab &> /dev/null; then
        echo "Apache Bench not available - skipping load test"
        return 0
    fi
    
    log INFO "🔥 Running basic load test..."
    
    local load_result=$(ab -n 50 -c 5 -q "$TARGET_URL/health" 2>/dev/null | grep "Requests per second" | awk '{print $4}')
    
    if [[ -n "$load_result" ]]; then
        echo "Load test: $load_result requests/sec"
    else
        echo "Load test failed"
        return 1
    fi
}

run_basic_verification() {
    log INFO "🔍 Running basic verification suite..."
    
    # Critical checks
    run_check "Basic Connectivity" "check_basic_connectivity" "true" || return 1
    run_check "Health Endpoint" "check_health_endpoint" "true" || return 1
    
    # Important checks
    run_check "API Endpoints" "check_api_endpoints" "false"
    run_check "Database Connectivity" "check_database_connectivity" "false"
    run_check "Response Time" "check_response_time" "false"
    run_check "SSL Certificate" "check_ssl_certificate" "false"
}

run_comprehensive_verification() {
    log INFO "🔍 Running comprehensive verification suite..."
    
    # Run basic checks first
    run_basic_verification
    
    # Additional comprehensive checks
    run_check "Authentication Service" "check_authentication" "false"
    run_check "Security Headers" "check_security_headers" "false"
    run_check "API Documentation" "check_api_documentation" "false"
    run_check "CORS Configuration" "check_cors_configuration" "false"
    run_check "Rate Limiting" "check_rate_limiting" "false"
    run_check "Monitoring Endpoints" "check_monitoring_endpoints" "false"
    run_check "Load Test" "run_load_test" "false"
}

generate_verification_report() {
    log INFO "📊 Generating verification report..."
    
    local report_file="/tmp/verification-report-$(date +%Y%m%d-%H%M%S).json"
    local overall_status="PASS"
    
    if [[ ${#FAILED_CHECKS[@]} -gt 0 ]]; then
        overall_status="FAIL"
    fi
    
    cat > "$report_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "target": "$TARGET_URL",
    "environment": "$ENVIRONMENT",
    "overall_status": "$overall_status",
    "summary": {
        "total_checks": $TOTAL_CHECKS,
        "passed_checks": $PASSED_CHECKS,
        "failed_checks": ${#FAILED_CHECKS[@]},
        "success_rate": $(echo "scale=2; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc 2>/dev/null || echo "0")
    },
    "failed_checks": [$(printf '"%s",' "${FAILED_CHECKS[@]}" | sed 's/,$//')]
}
EOF
    
    log INFO "📄 Verification report: $report_file"
    
    # Display summary
    echo -e "\n${CYAN}📋 Verification Summary:${NC}"
    echo -e "  Target: $TARGET_URL"
    echo -e "  Environment: $ENVIRONMENT"
    echo -e "  Overall Status: $(if [[ "$overall_status" == "PASS" ]]; then echo -e "${GREEN}$overall_status${NC}"; else echo -e "${RED}$overall_status${NC}"; fi)"
    echo -e "  Total Checks: $TOTAL_CHECKS"
    echo -e "  Passed: ${GREEN}$PASSED_CHECKS${NC}"
    echo -e "  Failed: ${RED}${#FAILED_CHECKS[@]}${NC}"
    
    local success_rate=$(echo "scale=1; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc 2>/dev/null || echo "0")
    echo -e "  Success Rate: ${success_rate}%"
    
    if [[ ${#FAILED_CHECKS[@]} -gt 0 ]]; then
        echo -e "\n${RED}❌ Failed Checks:${NC}"
        for check in "${FAILED_CHECKS[@]}"; do
            echo -e "  - $check"
        done
    fi
    
    echo ""
    
    return $(if [[ "$overall_status" == "PASS" ]]; then echo 0; else echo 1; fi)
}

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --comprehensive)
                COMPREHENSIVE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                if [[ -z "$TARGET_URL" ]]; then
                    TARGET_URL=$1
                elif [[ "$ENVIRONMENT" == "staging" ]]; then
                    ENVIRONMENT=$1
                else
                    log ERROR "Unknown argument: $1"
                    usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    print_banner
    
    # Auto-detect target URL if not provided
    if [[ -z "$TARGET_URL" ]]; then
        TARGET_URL=$(detect_target_url)
        log INFO "🔍 Auto-detected target URL: $TARGET_URL"
    fi
    
    # Validate URL
    if ! curl -f --max-time 5 --silent --head "$TARGET_URL" >/dev/null 2>&1; then
        log ERROR "Target URL is not accessible: $TARGET_URL"
        exit 1
    fi
    
    # Run verification
    if [[ "$COMPREHENSIVE" == "true" ]]; then
        run_comprehensive_verification
    else
        run_basic_verification
    fi
    
    # Generate report and exit with appropriate code
    if generate_verification_report; then
        log SUCCESS "🎉 Verification completed successfully!"
        exit 0
    else
        log ERROR "💥 Verification failed!"
        exit 1
    fi
}

# Execute main function
main "$@"
