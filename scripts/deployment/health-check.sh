#!/bin/bash
# Comprehensive Health Check Script for School ERP SaaS

set -euo pipefail

# Script metadata
SCRIPT_NAME="health-check.sh"
SCRIPT_VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-production}
DEPLOYMENT_TYPE=${2:-docker}
API_BASE_URL=${API_BASE_URL:-}
TIMEOUT=${HEALTH_CHECK_TIMEOUT:-300}
RETRY_INTERVAL=${RETRY_INTERVAL:-10}
VERBOSE=${VERBOSE:-false}
LOG_FILE="/tmp/health-check-$(date +%Y%m%d-%H%M%S).log"

# Health check results
declare -A HEALTH_RESULTS
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Functions
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        DEBUG) [[ "$VERBOSE" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        CHECK) echo -e "${CYAN}[CHECK]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        SUCCESS) echo -e "${GREEN}[✅]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        FAIL) echo -e "${RED}[❌]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        *) echo -e "${message}" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║               🏥 COMPREHENSIVE HEALTH CHECKER               ║
║             School ERP SaaS - System Validation             ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Environment: $ENVIRONMENT"
    echo "Deployment: $DEPLOYMENT_TYPE"
    echo "API Base URL: ${API_BASE_URL:-Auto-detect}"
    echo "Timeout: ${TIMEOUT}s"
    echo "Log File: $LOG_FILE"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 [environment] [deployment_type] [options]

ARGUMENTS:
    environment       Target environment (default: production)
    deployment_type   Deployment type (docker|k8s|aws|vercel)

OPTIONS:
    --url URL         API base URL (auto-detected if not provided)
    --timeout SECS    Health check timeout (default: 300)
    --interval SECS   Retry interval (default: 10)
    --verbose         Enable verbose logging
    --help            Show this help message

EXAMPLES:
    $0 production k8s
    $0 staging docker --url https://staging-api.example.com
    $0 development --timeout 600 --verbose

ENVIRONMENT VARIABLES:
    API_BASE_URL         API base URL
    HEALTH_CHECK_TIMEOUT Health check timeout in seconds
    RETRY_INTERVAL       Retry interval in seconds
    VERBOSE              Enable verbose mode (true/false)
EOF
}

detect_api_url() {
    if [[ -n "$API_BASE_URL" ]]; then
        echo "$API_BASE_URL"
        return 0
    fi
    
    log INFO "🔍 Auto-detecting API URL..."
    
    case $DEPLOYMENT_TYPE in
        docker)
            # Check if containers are running
            if docker-compose -f "$PROJECT_ROOT/docker/docker-compose.prod.yml" ps | grep -q "Up"; then
                echo "http://localhost:3000"
                return 0
            fi
            ;;
        k8s)
            # Get service URL from Kubernetes
            local service_url=$(kubectl get svc school-erp-service -n school-erp -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
            if [[ -n "$service_url" ]]; then
                echo "http://$service_url"
                return 0
            fi
            
            # Try port-forward as fallback
            kubectl port-forward -n school-erp svc/school-erp-service 8080:80 >/dev/null 2>&1 &
            local pf_pid=$!
            sleep 5
            echo "http://localhost:8080"
            # Note: PID stored for cleanup
            echo "$pf_pid" > /tmp/health-check-pf.pid
            return 0
            ;;
        aws)
            # Get ALB endpoint from Terraform output or AWS CLI
            if command -v terraform &>/dev/null && [[ -d "$PROJECT_ROOT/infrastructure/terraform" ]]; then
                cd "$PROJECT_ROOT/infrastructure/terraform"
                local alb_url=$(terraform output -raw api_endpoint 2>/dev/null || echo "")
                if [[ -n "$alb_url" ]]; then
                    echo "$alb_url"
                    return 0
                fi
            fi
            ;;
        vercel)
            echo "https://your-project.vercel.app"
            return 0
            ;;
    esac
    
    log WARN "Could not auto-detect API URL, using default"
    echo "http://localhost:3000"
}

record_result() {
    local check_name=$1
    local result=$2
    local duration=$3
    local details=${4:-}
    
    HEALTH_RESULTS["$check_name"]="$result:$duration:$details"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [[ "$result" == "PASS" ]]; then
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        log SUCCESS "$check_name: PASSED (${duration}ms) $details"
    else
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        log FAIL "$check_name: FAILED (${duration}ms) $details"
    fi
}

http_check() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    local timeout=${4:-10}
    
    log CHECK "Testing $name: $url"
    
    local start_time=$(date +%s%3N)
    local response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total}" \
        --max-time "$timeout" \
        --connect-timeout 5 \
        "$url" 2>/dev/null || echo "HTTPSTATUS:000;TIME:0")
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    local http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local time_total=$(echo "$response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)
    
    if [[ "$http_status" == "$expected_status" ]]; then
        record_result "$name" "PASS" "$duration" "HTTP $http_status (${time_total}s)"
    else
        record_result "$name" "FAIL" "$duration" "HTTP $http_status (expected $expected_status)"
    fi
}

json_api_check() {
    local name=$1
    local url=$2
    local expected_field=$3
    local expected_value=$4
    local timeout=${5:-10}
    
    log CHECK "Testing $name: $url"
    
    local start_time=$(date +%s%3N)
    local response=$(curl -s --max-time "$timeout" \
        --connect-timeout 5 \
        -H "Accept: application/json" \
        "$url" 2>/dev/null || echo "{}")
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    if command -v jq &>/dev/null; then
        local actual_value=$(echo "$response" | jq -r ".$expected_field" 2>/dev/null || echo "null")
        
        if [[ "$actual_value" == "$expected_value" ]]; then
            record_result "$name" "PASS" "$duration" "$expected_field=$actual_value"
        else
            record_result "$name" "FAIL" "$duration" "$expected_field=$actual_value (expected $expected_value)"
        fi
    else
        # Fallback without jq
        if echo "$response" | grep -q "\"$expected_field\""; then
            record_result "$name" "PASS" "$duration" "Field $expected_field present"
        else
            record_result "$name" "FAIL" "$duration" "Field $expected_field missing"
        fi
    fi
}

database_connectivity_check() {
    log CHECK "Testing database connectivity..."
    
    local start_time=$(date +%s%3N)
    
    case $DEPLOYMENT_TYPE in
        docker)
            # Check if MongoDB container is running and accessible
            if docker exec school-erp-mongodb mongosh --eval "db.adminCommand('ping')" &>/dev/null; then
                local end_time=$(date +%s%3N)
                record_result "MongoDB Connectivity" "PASS" $((end_time - start_time)) "Container accessible"
            else
                local end_time=$(date +%s%3N)
                record_result "MongoDB Connectivity" "FAIL" $((end_time - start_time)) "Container not accessible"
            fi
            ;;
        k8s)
            # Check MongoDB pod status
            if kubectl get pods -n school-erp -l app=mongodb --field-selector=status.phase=Running | grep -q "Running"; then
                local end_time=$(date +%s%3N)
                record_result "MongoDB Connectivity" "PASS" $((end_time - start_time)) "Pod running"
            else
                local end_time=$(date +%s%3N)
                record_result "MongoDB Connectivity" "FAIL" $((end_time - start_time)) "Pod not running"
            fi
            ;;
        aws)
            # Check via API health endpoint that includes DB status
            json_api_check "Database Connectivity" "$API_BASE_URL/health" "database" "connected"
            ;;
        *)
            # Generic API-based check
            json_api_check "Database Connectivity" "$API_BASE_URL/health" "database" "connected"
            ;;
    esac
}

cache_connectivity_check() {
    log CHECK "Testing cache connectivity..."
    
    local start_time=$(date +%s%3N)
    
    case $DEPLOYMENT_TYPE in
        docker)
            # Check Redis container
            if docker exec school-erp-redis redis-cli ping | grep -q "PONG"; then
                local end_time=$(date +%s%3N)
                record_result "Redis Connectivity" "PASS" $((end_time - start_time)) "Container accessible"
            else
                local end_time=$(date +%s%3N)
                record_result "Redis Connectivity" "FAIL" $((end_time - start_time)) "Container not accessible"
            fi
            ;;
        k8s)
            # Check Redis pod
            if kubectl get pods -n school-erp -l app=redis --field-selector=status.phase=Running | grep -q "Running"; then
                local end_time=$(date +%s%3N)
                record_result "Redis Connectivity" "PASS" $((end_time - start_time)) "Pod running"
            else
                local end_time=$(date +%s%3N)
                record_result "Redis Connectivity" "FAIL" $((end_time - start_time)) "Pod not running"
            fi
            ;;
        *)
            # Check via API
            json_api_check "Cache Connectivity" "$API_BASE_URL/health" "cache" "connected"
            ;;
    esac
}

application_functionality_check() {
    log CHECK "Testing application functionality..."
    
    # Test authentication endpoint
    http_check "Auth Endpoint" "$API_BASE_URL/api/v1/auth/health" 200
    
    # Test API documentation (if enabled)
    if [[ "$ENVIRONMENT" != "production" ]]; then
        http_check "API Documentation" "$API_BASE_URL/api-docs" 200
    fi
    
    # Test a protected endpoint (should return 401 without auth)
    http_check "Protected Endpoint" "$API_BASE_URL/api/v1/school/dashboard" 401
    
    # Test metrics endpoint (if available)
    http_check "Metrics Endpoint" "$API_BASE_URL/metrics" 200 5
}

performance_check() {
    log CHECK "Testing application performance..."
    
    local start_time=$(date +%s%3N)
    local response_time=$(curl -o /dev/null -s -w "%{time_total}" --max-time 30 "$API_BASE_URL/health" 2>/dev/null || echo "30")
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    # Convert to milliseconds
    local response_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "0")
    
    if (( $(echo "$response_time < 2.0" | bc -l 2>/dev/null || echo "0") )); then
        record_result "Response Time" "PASS" "$duration" "${response_ms}ms (< 2000ms)"
    else
        record_result "Response Time" "FAIL" "$duration" "${response_ms}ms (>= 2000ms)"
    fi
}

security_check() {
    log CHECK "Testing security headers..."
    
    local headers=$(curl -I -s --max-time 10 "$API_BASE_URL/health" 2>/dev/null || echo "")
    
    # Check for security headers
    local security_headers=("X-Content-Type-Options" "X-Frame-Options" "X-XSS-Protection")
    
    for header in "${security_headers[@]}"; do
        local start_time=$(date +%s%3N)
        if echo "$headers" | grep -qi "$header"; then
            local end_time=$(date +%s%3N)
            record_result "Security Header: $header" "PASS" $((end_time - start_time)) "Present"
        else
            local end_time=$(date +%s%3N)
            record_result "Security Header: $header" "FAIL" $((end_time - start_time)) "Missing"
        fi
    done
}

container_health_check() {
    if [[ "$DEPLOYMENT_TYPE" == "docker" ]]; then
        log CHECK "Testing container health..."
        
        local containers=$(docker-compose -f "$PROJECT_ROOT/docker/docker-compose.prod.yml" ps --services)
        
        for container in $containers; do
            local start_time=$(date +%s%3N)
            local status=$(docker-compose -f "$PROJECT_ROOT/docker/docker-compose.prod.yml" ps "$container" | tail -1 | awk '{print $3}')
            local end_time=$(date +%s%3N)
            
            if [[ "$status" == "Up" ]] || [[ "$status" =~ "Up" ]]; then
                record_result "Container: $container" "PASS" $((end_time - start_time)) "$status"
            else
                record_result "Container: $container" "FAIL" $((end_time - start_time)) "$status"
            fi
        done
    fi
}

kubernetes_health_check() {
    if [[ "$DEPLOYMENT_TYPE" == "k8s" ]]; then
        log CHECK "Testing Kubernetes resources..."
        
        # Check deployment status
        local start_time=$(date +%s%3N)
        local ready_replicas=$(kubectl get deployment school-erp-api -n school-erp -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        local desired_replicas=$(kubectl get deployment school-erp-api -n school-erp -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")
        local end_time=$(date +%s%3N)
        
        if [[ "$ready_replicas" -eq "$desired_replicas" ]] && [[ "$ready_replicas" -gt 0 ]]; then
            record_result "K8s Deployment" "PASS" $((end_time - start_time)) "$ready_replicas/$desired_replicas ready"
        else
            record_result "K8s Deployment" "FAIL" $((end_time - start_time)) "$ready_replicas/$desired_replicas ready"
        fi
        
        # Check service status
        start_time=$(date +%s%3N)
        if kubectl get svc school-erp-service -n school-erp &>/dev/null; then
            end_time=$(date +%s%3N)
            record_result "K8s Service" "PASS" $((end_time - start_time)) "Service exists"
        else
            end_time=$(date +%s%3N)
            record_result "K8s Service" "FAIL" $((end_time - start_time)) "Service missing"
        fi
    fi
}

wait_for_application() {
    log INFO "⏳ Waiting for application to be ready..."
    
    local start_time=$(date +%s)
    local max_wait_time=$((start_time + TIMEOUT))
    
    while [[ $(date +%s) -lt $max_wait_time ]]; do
        log DEBUG "Checking application readiness... ($(date +%s - start_time)s elapsed)"
        
        if curl -sf "$API_BASE_URL/health" >/dev/null 2>&1; then
            log SUCCESS "✅ Application is ready"
            return 0
        fi
        
        log DEBUG "Application not ready, waiting ${RETRY_INTERVAL}s..."
        sleep "$RETRY_INTERVAL"
    done
    
    log ERROR "❌ Application failed to become ready within ${TIMEOUT}s"
    return 1
}

generate_health_report() {
    local report_file="/tmp/health-report-$(date +%Y%m%d-%H%M%S).json"
    
    log INFO "📊 Generating health report..."
    
    cat > "$report_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "environment": "$ENVIRONMENT",
    "deploymentType": "$DEPLOYMENT_TYPE",
    "apiBaseUrl": "$API_BASE_URL",
    "summary": {
        "totalChecks": $TOTAL_CHECKS,
        "passedChecks": $PASSED_CHECKS,
        "failedChecks": $FAILED_CHECKS,
        "successRate": $(echo "scale=2; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc 2>/dev/null || echo "0")
    },
    "results": {
EOF

    local first=true
    for check in "${!HEALTH_RESULTS[@]}"; do
        if [[ "$first" != "true" ]]; then
            echo "," >> "$report_file"
        fi
        
        local result_info=(${HEALTH_RESULTS[$check]//:/ })
        local status=${result_info[0]}
        local duration=${result_info[1]:-0}
        local details=${result_info[2]:-}
        
        echo "        \"$check\": {" >> "$report_file"
        echo "            \"status\": \"$status\"," >> "$report_file"
        echo "            \"duration\": $duration," >> "$report_file"
        echo "            \"details\": \"$details\"" >> "$report_file"
        echo -n "        }" >> "$report_file"
        first=false
    done

    cat >> "$report_file" << EOF

    }
}
EOF

    log INFO "📄 Health report generated: $report_file"
    
    # Display summary
    echo -e "\n${CYAN}📊 Health Check Summary:${NC}"
    echo -e "  Total Checks: $TOTAL_CHECKS"
    echo -e "  Passed: ${GREEN}$PASSED_CHECKS${NC}"
    echo -e "  Failed: ${RED}$FAILED_CHECKS${NC}"
    local success_rate=$(echo "scale=1; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc 2>/dev/null || echo "0")
    echo -e "  Success Rate: ${success_rate}%"
}

cleanup() {
    local exit_code=$?
    
    # Clean up port-forward if running
    if [[ -f "/tmp/health-check-pf.pid" ]]; then
        local pf_pid=$(cat /tmp/health-check-pf.pid)
        kill "$pf_pid" 2>/dev/null || true
        rm -f /tmp/health-check-pf.pid
    fi
    
    generate_health_report
    
    if [[ $exit_code -eq 0 ]]; then
        log SUCCESS "✅ All health checks completed"
        if [[ $FAILED_CHECKS -gt 0 ]]; then
            log WARN "⚠️ Some checks failed - review the results above"
            exit 1
        fi
    else
        log ERROR "❌ Health check process failed"
    fi
    
    exit $exit_code
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --url)
            API_BASE_URL="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --interval)
            RETRY_INTERVAL="$2"
            shift 2
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
            if [[ -z "${ENVIRONMENT_SET:-}" ]]; then
                ENVIRONMENT=$1
                ENVIRONMENT_SET=true
            elif [[ -z "${DEPLOYMENT_TYPE_SET:-}" ]]; then
                DEPLOYMENT_TYPE=$1
                DEPLOYMENT_TYPE_SET=true
            else
                log ERROR "Unknown argument: $1"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Main execution
main() {
    trap cleanup EXIT
    
    print_banner
    
    # Detect API URL if not provided
    API_BASE_URL=$(detect_api_url)
    log INFO "API Base URL: $API_BASE_URL"
    
    # Wait for application to be ready
    if ! wait_for_application; then
        log ERROR "Application is not ready, skipping detailed health checks"
        exit 1
    fi
    
    # Run comprehensive health checks
    log INFO "🏥 Running comprehensive health checks..."
    
    # Core API checks
    http_check "Health Endpoint" "$API_BASE_URL/health" 200
    json_api_check "Health Status" "$API_BASE_URL/health" "status" "healthy"
    
    # Infrastructure checks
    database_connectivity_check
    cache_connectivity_check
    
    # Application functionality
    application_functionality_check
    
    # Performance and security
    performance_check
    security_check
    
    # Platform-specific checks
    container_health_check
    kubernetes_health_check
    
    log SUCCESS "🎉 Health check process completed!"
}

# Run main function
main "$@"
