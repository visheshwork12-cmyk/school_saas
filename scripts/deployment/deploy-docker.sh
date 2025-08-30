#!/bin/bash
# Enhanced Docker Deployment Script with comprehensive features

set -euo pipefail

# Script metadata
SCRIPT_NAME="deploy-docker.sh"
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
VERSION=${2:-latest}
REGISTRY=${DOCKER_REGISTRY:-}
IMAGE_NAME=${DOCKER_IMAGE_NAME:-school-erp}
COMPOSE_FILE=""
LOG_FILE="/tmp/docker-deployment-$(date +%Y%m%d-%H%M%S).log"
HEALTH_CHECK_TIMEOUT=${HEALTH_CHECK_TIMEOUT:-300}
ROLLBACK_ON_FAILURE=${ROLLBACK_ON_FAILURE:-true}
BACKUP_VOLUMES=${BACKUP_VOLUMES:-false}
MULTI_ARCH=${MULTI_ARCH:-false}

# Arrays
declare -a VALID_ENVIRONMENTS=("development" "staging" "production" "local")

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
        DEBUG) [[ "${DEBUG:-}" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        *) echo -e "${message}" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║                  🐳 DOCKER DEPLOYMENT SCRIPT                ║
║               School ERP SaaS - Container Deploy            ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Version: $SCRIPT_VERSION"
    echo "Environment: $ENVIRONMENT"
    echo "Image Version: $VERSION"
    echo "Registry: ${REGISTRY:-Local}"
    echo "Log File: $LOG_FILE"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 <environment> [version] [options]

ARGUMENTS:
    environment     Target environment (development|staging|production|local)
    version        Docker image version tag (default: latest)

OPTIONS:
    --registry      Docker registry URL
    --image-name    Docker image name (default: school-erp)
    --no-cache      Build without using cache
    --multi-arch    Build for multiple architectures
    --backup        Backup volumes before deployment
    --no-rollback   Disable automatic rollback on failure
    --debug         Enable debug logging
    --help          Show this help message

EXAMPLES:
    $0 production v1.2.0
    $0 staging latest --registry my-registry.com
    $0 development --no-cache --debug
    $0 production v1.2.0 --multi-arch --backup

ENVIRONMENT VARIABLES:
    DOCKER_REGISTRY       Docker registry URL
    DOCKER_IMAGE_NAME     Docker image name
    HEALTH_CHECK_TIMEOUT  Health check timeout in seconds
    ROLLBACK_ON_FAILURE   Enable/disable rollback (true/false)
    BACKUP_VOLUMES        Backup volumes before deploy (true/false)
EOF
}

check_prerequisites() {
    log INFO "🔍 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log ERROR "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log ERROR "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log ERROR "Docker daemon is not running"
        exit 1
    fi
    
    # Check if user can run Docker commands
    if ! docker ps &> /dev/null; then
        log ERROR "Cannot run Docker commands. Check Docker permissions."
        exit 1
    fi
    
    local docker_version=$(docker --version | cut -d' ' -f3 | tr -d ',')
    local compose_version=$(docker-compose --version | cut -d' ' -f3 | tr -d ',')
    
    log INFO "Docker version: $docker_version"
    log INFO "Docker Compose version: $compose_version"
    
    # Check available disk space
    local available_space=$(df / | tail -1 | awk '{print $4}')
    if [[ $available_space -lt 5000000 ]]; then  # 5GB in KB
        log WARN "Low disk space available: $(($available_space / 1024 / 1024))GB"
    fi
    
    log INFO "✅ Prerequisites check passed"
}

determine_compose_file() {
    case $ENVIRONMENT in
        development|local)
            COMPOSE_FILE="docker/docker-compose.dev.yml"
            ;;
        staging)
            COMPOSE_FILE="docker/docker-compose.staging.yml"
            if [[ ! -f "$PROJECT_ROOT/$COMPOSE_FILE" ]]; then
                COMPOSE_FILE="docker/docker-compose.yml"
            fi
            ;;
        production)
            COMPOSE_FILE="docker/docker-compose.prod.yml"
            ;;
        *)
            COMPOSE_FILE="docker/docker-compose.yml"
            ;;
    esac
    
    if [[ ! -f "$PROJECT_ROOT/$COMPOSE_FILE" ]]; then
        log ERROR "Compose file not found: $PROJECT_ROOT/$COMPOSE_FILE"
        exit 1
    fi
    
    log INFO "Using compose file: $COMPOSE_FILE"
}

backup_volumes() {
    if [[ "$BACKUP_VOLUMES" == "true" ]]; then
        log INFO "💾 Creating volume backups..."
        
        local backup_dir="$PROJECT_ROOT/backups/docker/$ENVIRONMENT"
        local backup_timestamp=$(date +%Y%m%d-%H%M%S)
        
        mkdir -p "$backup_dir"
        
        # Get all volumes used by the application
        local volumes=$(docker-compose -f "$PROJECT_ROOT/$COMPOSE_FILE" config --volumes 2>/dev/null || echo "")
        
        for volume in $volumes; do
            local full_volume_name="${PWD##*/}_${volume}"
            if docker volume inspect "$full_volume_name" &>/dev/null; then
                log INFO "Backing up volume: $volume"
                local backup_file="$backup_dir/${volume}-${backup_timestamp}.tar.gz"
                
                docker run --rm \
                    -v "$full_volume_name:/source:ro" \
                    -v "$backup_dir:/backup" \
                    alpine tar czf "/backup/${volume}-${backup_timestamp}.tar.gz" -C /source .
                
                log INFO "Volume backup created: $backup_file"
            fi
        done
    fi
}

build_image() {
    log INFO "🔨 Building Docker image..."
    
    local dockerfile=""
    local build_args=""
    local cache_args=""
    
    # Determine Dockerfile based on environment
    case $ENVIRONMENT in
        development|local)
            dockerfile="docker/Dockerfile.dev"
            build_args="--build-arg NODE_ENV=development"
            ;;
        production)
            dockerfile="docker/Dockerfile.prod"
            build_args="--build-arg NODE_ENV=production"
            ;;
        *)
            dockerfile="docker/Dockerfile"
            build_args="--build-arg NODE_ENV=$ENVIRONMENT"
            ;;
    esac
    
    # Cache options
    if [[ "${NO_CACHE:-}" == "true" ]]; then
        cache_args="--no-cache"
    fi
    
    # Build arguments
    build_args="$build_args --build-arg VERSION=$VERSION"
    build_args="$build_args --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    build_args="$build_args --build-arg COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
    
    cd "$PROJECT_ROOT" || exit 1
    
    # Build for single architecture
    if [[ "$MULTI_ARCH" != "true" ]]; then
        local image_tag="$IMAGE_NAME:$VERSION"
        if [[ -n "$REGISTRY" ]]; then
            image_tag="$REGISTRY/$IMAGE_NAME:$VERSION"
        fi
        
        docker build \
            -f "$dockerfile" \
            $build_args \
            $cache_args \
            -t "$image_tag" \
            . || {
            log ERROR "Docker build failed"
            exit 1
        }
        
        # Tag as latest for non-production
        if [[ "$ENVIRONMENT" != "production" ]]; then
            local latest_tag="$IMAGE_NAME:latest"
            if [[ -n "$REGISTRY" ]]; then
                latest_tag="$REGISTRY/$IMAGE_NAME:latest"
            fi
            docker tag "$image_tag" "$latest_tag"
        fi
        
    else
        # Multi-architecture build using buildx
        log INFO "🏗️ Building multi-architecture image..."
        
        # Ensure buildx is available
        if ! docker buildx version &> /dev/null; then
            log ERROR "Docker buildx is not available for multi-architecture builds"
            exit 1
        fi
        
        # Create builder if it doesn't exist
        if ! docker buildx ls | grep -q "school-erp-builder"; then
            docker buildx create --name school-erp-builder --use
        else
            docker buildx use school-erp-builder
        fi
        
        local platforms="linux/amd64,linux/arm64"
        local image_tag="$IMAGE_NAME:$VERSION"
        if [[ -n "$REGISTRY" ]]; then
            image_tag="$REGISTRY/$IMAGE_NAME:$VERSION"
        fi
        
        docker buildx build \
            --platform "$platforms" \
            -f "$dockerfile" \
            $build_args \
            $cache_args \
            -t "$image_tag" \
            --push \
            . || {
            log ERROR "Multi-architecture build failed"
            exit 1
        }
    fi
    
    log INFO "✅ Docker image built successfully"
}

push_image() {
    if [[ -n "$REGISTRY" ]] && [[ "$MULTI_ARCH" != "true" ]]; then
        log INFO "⬆️ Pushing image to registry..."
        
        local image_tag="$REGISTRY/$IMAGE_NAME:$VERSION"
        
        # Login to registry if credentials are provided
        if [[ -n "${DOCKER_USERNAME:-}" ]] && [[ -n "${DOCKER_PASSWORD:-}" ]]; then
            echo "$DOCKER_PASSWORD" | docker login "$REGISTRY" -u "$DOCKER_USERNAME" --password-stdin
        fi
        
        docker push "$image_tag" || {
            log ERROR "Failed to push image to registry"
            exit 1
        }
        
        # Push latest tag for non-production
        if [[ "$ENVIRONMENT" != "production" ]]; then
            docker push "$REGISTRY/$IMAGE_NAME:latest"
        fi
        
        log INFO "✅ Image pushed to registry successfully"
    fi
}

stop_existing_containers() {
    log INFO "🛑 Stopping existing containers..."
    
    cd "$PROJECT_ROOT" || exit 1
    
    # Check if any containers are running
    if docker-compose -f "$COMPOSE_FILE" ps --services --filter "status=running" | grep -q .; then
        # Graceful stop with timeout
        docker-compose -f "$COMPOSE_FILE" stop --timeout 30
        
        # Remove containers
        docker-compose -f "$COMPOSE_FILE" rm -f
        
        log INFO "✅ Existing containers stopped and removed"
    else
        log INFO "No running containers found"
    fi
}

deploy_containers() {
    log INFO "🚀 Deploying containers..."
    
    cd "$PROJECT_ROOT" || exit 1
    
    # Set environment variables for compose
    export VERSION
    export ENVIRONMENT
    export REGISTRY
    
    # Create external networks if they don't exist
    local networks=$(docker-compose -f "$COMPOSE_FILE" config --networks 2>/dev/null || echo "")
    for network in $networks; do
        if [[ "$network" != "default" ]] && ! docker network ls --format "{{.Name}}" | grep -q "^$network$"; then
            log INFO "Creating network: $network"
            docker network create "$network" || true
        fi
    done
    
    # Deploy using docker-compose
    docker-compose -f "$COMPOSE_FILE" up -d --remove-orphans || {
        log ERROR "Failed to deploy containers"
        return 1
    }
    
    log INFO "✅ Containers deployed successfully"
    
    # Show container status
    docker-compose -f "$COMPOSE_FILE" ps
    
    return 0
}

health_check() {
    log INFO "🏥 Performing health checks..."
    
    cd "$PROJECT_ROOT" || exit 1
    
    local start_time=$(date +%s)
    local timeout=$HEALTH_CHECK_TIMEOUT
    
    # Get main service name (assuming it's the first service or 'app')
    local main_service=$(docker-compose -f "$COMPOSE_FILE" config --services | head -1)
    local service_name="${PWD##*/}_${main_service}_1"
    
    # Alternative service name format for newer docker-compose versions
    if ! docker ps --format "{{.Names}}" | grep -q "$service_name"; then
        service_name="${PWD##*/}-${main_service}-1"
    fi
    
    log INFO "Checking health of service: $main_service (container: $service_name)"
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [[ $elapsed -gt $timeout ]]; then
            log ERROR "Health check timeout after ${timeout}s"
            return 1
        fi
        
        # Check if container is running
        if ! docker ps --format "{{.Names}}" | grep -q "$service_name"; then
            log WARN "Container $service_name not found or not running"
            sleep 5
            continue
        fi
        
        # Check container health
        local health_status=$(docker inspect --format="{{.State.Health.Status}}" "$service_name" 2>/dev/null || echo "none")
        
        case $health_status in
            "healthy")
                log INFO "✅ Container is healthy"
                return 0
                ;;
            "unhealthy")
                log ERROR "❌ Container is unhealthy"
                # Show container logs for debugging
                log ERROR "Container logs (last 20 lines):"
                docker logs --tail 20 "$service_name"
                return 1
                ;;
            "starting")
                log INFO "Container is starting... (${elapsed}s/${timeout}s)"
                ;;
            "none")
                # No healthcheck defined, check if container is running and responsive
                if docker exec "$service_name" curl -f http://localhost:3000/health &>/dev/null; then
                    log INFO "✅ Service is responsive"
                    return 0
                else
                    log INFO "Service not ready yet... (${elapsed}s/${timeout}s)"
                fi
                ;;
            *)
                log INFO "Health status: $health_status (${elapsed}s/${timeout}s)"
                ;;
        esac
        
        sleep 10
    done
}

rollback() {
    if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
        log WARN "🔄 Rolling back deployment..."
        
        cd "$PROJECT_ROOT" || exit 1
        
        # Stop current containers
        docker-compose -f "$COMPOSE_FILE" stop --timeout 30
        docker-compose -f "$COMPOSE_FILE" rm -f
        
        # Find the previous version
        local previous_version="previous"
        if [[ -n "$REGISTRY" ]]; then
            previous_version="$REGISTRY/$IMAGE_NAME:previous"
        else
            previous_version="$IMAGE_NAME:previous"
        fi
        
        # Check if previous version exists
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "$previous_version"; then
            log INFO "Rolling back to previous version: $previous_version"
            
            # Update version for rollback
            export VERSION=previous
            
            # Deploy previous version
            docker-compose -f "$COMPOSE_FILE" up -d --remove-orphans
            
            log INFO "✅ Rollback completed"
        else
            log WARN "No previous version found for rollback"
        fi
    fi
}

cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log INFO "✅ Docker deployment completed successfully"
        
        # Tag current version as previous for future rollbacks
        if [[ "$ENVIRONMENT" == "production" ]] && [[ -n "$REGISTRY" ]]; then
            docker tag "$REGISTRY/$IMAGE_NAME:$VERSION" "$REGISTRY/$IMAGE_NAME:previous"
            docker push "$REGISTRY/$IMAGE_NAME:previous" 2>/dev/null || true
        fi
        
    else
        log ERROR "❌ Docker deployment failed with exit code $exit_code"
        log INFO "📝 Check log file: $LOG_FILE"
        
        # Attempt rollback on failure
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback
        fi
    fi
    
    # Cleanup old images to save space
    log INFO "🧹 Cleaning up old Docker images..."
    docker system prune -f --volumes=false 2>/dev/null || true
    
    exit $exit_code
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --image-name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --multi-arch)
            MULTI_ARCH=true
            shift
            ;;
        --backup)
            BACKUP_VOLUMES=true
            shift
            ;;
        --no-rollback)
            ROLLBACK_ON_FAILURE=false
            shift
            ;;
        --debug)
            DEBUG=true
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
            elif [[ "$VERSION" == "latest" ]] || [[ -z "${VERSION_SET:-}" ]]; then
                VERSION=$1
                VERSION_SET=true
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
    
    # Validation
    if [[ ! " ${VALID_ENVIRONMENTS[*]} " =~ " $ENVIRONMENT " ]]; then
        log ERROR "Invalid environment: $ENVIRONMENT"
        log INFO "Valid environments: ${VALID_ENVIRONMENTS[*]}"
        exit 1
    fi
    
    # Execute deployment steps
    check_prerequisites
    determine_compose_file
    backup_volumes
    build_image
    push_image
    stop_existing_containers
    
    if deploy_containers; then
        if health_check; then
            log INFO "🎉 Docker deployment completed successfully!"
        else
            log ERROR "Health check failed"
            exit 1
        fi
    else
        log ERROR "Container deployment failed"
        exit 1
    fi
}

# Run main function
main "$@"
