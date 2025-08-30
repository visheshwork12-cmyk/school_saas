#!/bin/bash
# Enhanced Kubernetes Deployment Script with comprehensive features

set -euo pipefail

# Script metadata
SCRIPT_NAME="deploy-k8s.sh"
SCRIPT_VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m'

# Configuration
NAMESPACE=${1:-school-erp}
ENVIRONMENT=${2:-production}
CLUSTER_NAME=${3:-}
REGION=${AWS_REGION:-us-east-1}
IMAGE_TAG=${4:-latest}
KUBECONFIG_PATH=${KUBECONFIG:-~/.kube/config}
DRY_RUN=${DRY_RUN:-false}
WAIT_TIMEOUT=${WAIT_TIMEOUT:-600}
LOG_FILE="/tmp/k8s-deployment-$(date +%Y%m%d-%H%M%S).log"

# Arrays
declare -a VALID_ENVIRONMENTS=("development" "staging" "production")
declare -a K8S_MANIFESTS=("namespace.yaml" "configmap.yaml" "secrets.yaml" "deployment.yaml" "service.yaml" "ingress.yaml" "hpa.yaml")
declare -a MONITORING_MANIFESTS=("prometheus.yaml" "grafana.yaml" "alertmanager.yml")

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
        DEBUG) [[ "${DEBUG:-}" == "true" ]] && echo -e "${PURPLE}[DEBUG]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        STEP)  echo -e "${CYAN}[STEP]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        *) echo -e "${message}" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║               ☸️  KUBERNETES DEPLOYMENT SCRIPT               ║
║               School ERP SaaS - K8s Deploy                  ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Version: $SCRIPT_VERSION"
    echo "Namespace: $NAMESPACE"
    echo "Environment: $ENVIRONMENT"
    echo "Cluster: ${CLUSTER_NAME:-Current Context}"
    echo "Region: $REGION"
    echo "Image Tag: $IMAGE_TAG"
    echo "Log File: $LOG_FILE"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 [namespace] [environment] [cluster] [image_tag] [options]

ARGUMENTS:
    namespace       Kubernetes namespace (default: school-erp)
    environment     Target environment (development|staging|production)
    cluster         EKS cluster name (optional)
    image_tag       Docker image tag (default: latest)

OPTIONS:
    --region        AWS region (default: us-east-1)
    --dry-run       Perform dry run without applying changes
    --timeout       Wait timeout in seconds (default: 600)
    --skip-health   Skip health checks after deployment
    --force         Force deployment without confirmation
    --debug         Enable debug logging
    --help          Show this help message

EXAMPLES:
    $0 school-erp production my-cluster v1.2.0
    $0 staging development --dry-run
    $0 production --timeout 900 --force

ENVIRONMENT VARIABLES:
    AWS_REGION      AWS region
    KUBECONFIG      Path to kubeconfig file
    DRY_RUN         Perform dry run (true/false)
    WAIT_TIMEOUT    Deployment wait timeout in seconds
EOF
}

check_prerequisites() {
    log STEP "🔍 Checking prerequisites..."
    
    # Check required tools
    local tools=("kubectl" "aws" "jq" "yq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log ERROR "$tool is not installed or not in PATH"
            exit 1
        fi
    done
    
    # Check kubectl version
    local kubectl_version=$(kubectl version --client --short 2>/dev/null | cut -d' ' -f3 | tr -d 'v')
    log INFO "kubectl version: $kubectl_version"
    
    # Check AWS CLI
    if ! aws sts get-caller-identity &> /dev/null; then
        log ERROR "AWS credentials not configured or invalid"
        exit 1
    fi
    
    # Check kubeconfig
    if [[ ! -f "$KUBECONFIG_PATH" ]]; then
        log ERROR "Kubeconfig not found at: $KUBECONFIG_PATH"
        exit 1
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log ERROR "Cannot connect to Kubernetes cluster"
        log INFO "Current context: $(kubectl config current-context 2>/dev/null || echo 'none')"
        exit 1
    fi
    
    local current_context=$(kubectl config current-context)
    log INFO "Connected to cluster: $current_context"
    
    # Verify K8s manifest files exist
    for manifest in "${K8S_MANIFESTS[@]}"; do
        if [[ ! -f "$PROJECT_ROOT/k8s/$manifest" ]]; then
            log ERROR "Kubernetes manifest not found: k8s/$manifest"
            exit 1
        fi
    done
    
    log INFO "✅ Prerequisites check passed"
}

setup_cluster_context() {
    if [[ -n "$CLUSTER_NAME" ]]; then
        log STEP "🔧 Setting up cluster context..."
        
        # Update kubeconfig for EKS cluster
        aws eks update-kubeconfig \
            --region "$REGION" \
            --name "$CLUSTER_NAME" \
            --kubeconfig "$KUBECONFIG_PATH"
        
        # Verify connection to the correct cluster
        local cluster_info=$(kubectl cluster-info | head -1)
        log INFO "Cluster info: $cluster_info"
        
        # Check if we have the necessary permissions
        if ! kubectl auth can-i create deployments --namespace "$NAMESPACE" &>/dev/null; then
            log ERROR "Insufficient permissions to deploy to namespace: $NAMESPACE"
            log INFO "Current user: $(kubectl config view --minify -o jsonpath='{.contexts[0].context.user}')"
            exit 1
        fi
        
        log INFO "✅ Cluster context setup completed"
    fi
}

create_namespace() {
    log STEP "📦 Setting up namespace..."
    
    if kubectl get namespace "$NAMESPACE" &>/dev/null; then
        log INFO "Namespace '$NAMESPACE' already exists"
    else
        log INFO "Creating namespace: $NAMESPACE"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "🧪 DRY RUN: Would create namespace $NAMESPACE"
            kubectl apply -f "$PROJECT_ROOT/k8s/namespace.yaml" --dry-run=client
        else
            kubectl apply -f "$PROJECT_ROOT/k8s/namespace.yaml"
        fi
        
        # Wait for namespace to be ready
        if [[ "$DRY_RUN" != "true" ]]; then
            kubectl wait --for=condition=Ready namespace/"$NAMESPACE" --timeout=60s
        fi
        
        log INFO "✅ Namespace created successfully"
    fi
}

validate_manifests() {
    log STEP "✅ Validating Kubernetes manifests..."
    
    local has_errors=false
    
    for manifest in "${K8S_MANIFESTS[@]}"; do
        local manifest_path="$PROJECT_ROOT/k8s/$manifest"
        
        log INFO "Validating: $manifest"
        
        # Basic YAML syntax validation
        if ! yq eval '.' "$manifest_path" >/dev/null 2>&1; then
            log ERROR "Invalid YAML syntax in: $manifest"
            has_errors=true
            continue
        fi
        
        # Kubernetes resource validation
        if ! kubectl apply -f "$manifest_path" --dry-run=client --validate=true &>/dev/null; then
            log ERROR "Kubernetes validation failed for: $manifest"
            kubectl apply -f "$manifest_path" --dry-run=client --validate=true 2>&1 | tail -5
            has_errors=true
        fi
    done
    
    if [[ "$has_errors" == "true" ]]; then
        log ERROR "Manifest validation failed"
        exit 1
    fi
    
    log INFO "✅ All manifests validated successfully"
}

update_image_tags() {
    log STEP "🏷️ Updating image tags..."
    
    local deployment_file="$PROJECT_ROOT/k8s/deployment.yaml"
    local temp_file=$(mktemp)
    
    # Update image tag in deployment manifest
    yq eval "(.spec.template.spec.containers[] | select(.name == \"school-erp-api\").image) = \"your-registry/school-erp:$IMAGE_TAG\"" "$deployment_file" > "$temp_file"
    
    if [[ "$DRY_RUN" != "true" ]]; then
        mv "$temp_file" "$deployment_file"
        log INFO "Updated image tag to: $IMAGE_TAG"
    else
        log INFO "🧪 DRY RUN: Would update image tag to: $IMAGE_TAG"
        rm "$temp_file"
    fi
}

apply_configmaps_and_secrets() {
    log STEP "🔐 Applying ConfigMaps and Secrets..."
    
    # Apply ConfigMap
    log INFO "Applying ConfigMap..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would apply ConfigMap"
        kubectl apply -f "$PROJECT_ROOT/k8s/configmap.yaml" -n "$NAMESPACE" --dry-run=client
    else
        kubectl apply -f "$PROJECT_ROOT/k8s/configmap.yaml" -n "$NAMESPACE"
    fi
    
    # Apply Secrets (with validation)
    log INFO "Applying Secrets..."
    local secrets_file="$PROJECT_ROOT/k8s/secrets.yaml"
    
    # Check if secrets are properly base64 encoded
    if grep -q "PLACEHOLDER" "$secrets_file"; then
        log ERROR "Secrets contain placeholder values. Please update with actual base64 encoded values."
        exit 1
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would apply Secrets"
        kubectl apply -f "$secrets_file" -n "$NAMESPACE" --dry-run=client
    else
        kubectl apply -f "$secrets_file" -n "$NAMESPACE"
    fi
    
    log INFO "✅ ConfigMaps and Secrets applied successfully"
}

deploy_storage() {
    log STEP "💾 Setting up storage..."
    
    local pvc_file="$PROJECT_ROOT/k8s/pvc.yaml"
    
    if [[ -f "$pvc_file" ]]; then
        log INFO "Applying Persistent Volume Claims..."
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "🧪 DRY RUN: Would apply PVC"
            kubectl apply -f "$pvc_file" -n "$NAMESPACE" --dry-run=client
        else
            kubectl apply -f "$pvc_file" -n "$NAMESPACE"
            
            # Wait for PVC to be bound
            log INFO "Waiting for PVC to be bound..."
            kubectl wait --for=condition=Bound pvc/school-erp-uploads-pvc -n "$NAMESPACE" --timeout=300s
        fi
    else
        log INFO "No PVC configuration found, skipping storage setup"
    fi
    
    log INFO "✅ Storage setup completed"
}

deploy_application() {
    log STEP "🚀 Deploying application..."
    
    # Apply deployment
    log INFO "Applying Deployment..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would apply Deployment"
        kubectl apply -f "$PROJECT_ROOT/k8s/deployment.yaml" -n "$NAMESPACE" --dry-run=client
    else
        kubectl apply -f "$PROJECT_ROOT/k8s/deployment.yaml" -n "$NAMESPACE"
    fi
    
    # Apply services
    log INFO "Applying Services..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would apply Services"
        kubectl apply -f "$PROJECT_ROOT/k8s/service.yaml" -n "$NAMESPACE" --dry-run=client
    else
        kubectl apply -f "$PROJECT_ROOT/k8s/service.yaml" -n "$NAMESPACE"
    fi
    
    # Apply HPA
    log INFO "Applying HPA..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would apply HPA"
        kubectl apply -f "$PROJECT_ROOT/k8s/hpa.yaml" -n "$NAMESPACE" --dry-run=client
    else
        kubectl apply -f "$PROJECT_ROOT/k8s/hpa.yaml" -n "$NAMESPACE"
    fi
    
    # Apply ingress
    log INFO "Applying Ingress..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would apply Ingress"
        kubectl apply -f "$PROJECT_ROOT/k8s/ingress
        
