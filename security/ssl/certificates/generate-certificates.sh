#!/bin/bash
# security/ssl/certificates/generate-certificates.sh - Certificate generation script

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

generate_dev_certificates() {
    log "🔐 Generating development certificates..."
    
    local dev_dir="$CERT_DIR/dev"
    mkdir -p "$dev_dir"
    
    # Generate CA private key
    openssl genrsa -out "$dev_dir/ca.key" 4096
    
    # Generate CA certificate
    openssl req -new -x509 -days 365 -key "$dev_dir/ca.key" -out "$dev_dir/ca.crt" \
        -subj "/C=IN/ST=Karnataka/L=Bangalore/O=School ERP Dev/CN=School ERP Development CA"
    
    # Generate server private key
    openssl genrsa -out "$dev_dir/server.key" 4096
    
    # Generate server certificate signing request
    openssl req -new -key "$dev_dir/server.key" -out "$dev_dir/server.csr" \
        -subj "/C=IN/ST=Karnataka/L=Bangalore/O=School ERP/CN=localhost"
    
    # Create certificate extensions file
    cat > "$dev_dir/server.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
DNS.3 = 127.0.0.1
DNS.4 = ::1
DNS.5 = school-erp.local
DNS.6 = *.school-erp.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
    
    # Generate server certificate
    openssl x509 -req -in "$dev_dir/server.csr" -CA "$dev_dir/ca.crt" -CAkey "$dev_dir/ca.key" \
        -CAcreateserial -out "$dev_dir/server.crt" -days 365 -extensions v3_req -extfile "$dev_dir/server.ext"
    
    # Clean up
    rm "$dev_dir/server.csr" "$dev_dir/server.ext"
    
    # Set proper permissions
    chmod 600 "$dev_dir"/*.key
    chmod 644 "$dev_dir"/*.crt
    
    log "✅ Development certificates generated successfully"
    log "📁 Certificates location: $dev_dir"
    log "🔗 Add $dev_dir/ca.crt to your browser's trusted certificates for HTTPS development"
}

generate_staging_certificates() {
    log "🔐 Generating staging certificates with Let's Encrypt..."
    
    local domain="${STAGING_DOMAIN:-staging.school-erp.com}"
    local email="${CERT_EMAIL:-admin@school-erp.com}"
    
    if ! command -v certbot &> /dev/null; then
        error "certbot is not installed. Please install certbot first."
        exit 1
    fi
    
    # Generate Let's Encrypt certificate
    certbot certonly --standalone \
        --email "$email" \
        --agree-tos \
        --non-interactive \
        --domain "$domain" \
        --cert-path "$CERT_DIR/staging" \
        --key-path "$CERT_DIR/staging" \
        --fullchain-path "$CERT_DIR/staging"
    
    log "✅ Staging certificates generated successfully"
}

validate_certificate() {
    local cert_file="$1"
    local key_file="$2"
    
    if [[ ! -f "$cert_file" ]]; then
        error "Certificate file not found: $cert_file"
        return 1
    fi
    
    if [[ ! -f "$key_file" ]]; then
        error "Private key file not found: $key_file"
        return 1
    fi
    
    # Validate certificate
    if openssl x509 -in "$cert_file" -text -noout &> /dev/null; then
        log "✅ Certificate is valid: $cert_file"
    else
        error "❌ Invalid certificate: $cert_file"
        return 1
    fi
    
    # Validate private key
    if openssl rsa -in "$key_file" -check &> /dev/null; then
        log "✅ Private key is valid: $key_file"
    else
        error "❌ Invalid private key: $key_file"
        return 1
    fi
    
    # Check if certificate and key match
    cert_modulus=$(openssl x509 -noout -modulus -in "$cert_file" | openssl md5)
    key_modulus=$(openssl rsa -noout -modulus -in "$key_file" | openssl md5)
    
    if [[ "$cert_modulus" == "$key_modulus" ]]; then
        log "✅ Certificate and private key match"
    else
        error "❌ Certificate and private key do not match"
        return 1
    fi
}

check_certificate_expiry() {
    local cert_file="$1"
    
    if [[ ! -f "$cert_file" ]]; then
        error "Certificate file not found: $cert_file"
        return 1
    fi
    
    local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
    local expiry_epoch=$(date -d "$expiry_date" +%s)
    local current_epoch=$(date +%s)
    local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
    
    if [[ $days_until_expiry -lt 0 ]]; then
        error "❌ Certificate has expired: $cert_file"
        return 1
    elif [[ $days_until_expiry -lt 30 ]]; then
        warn "⚠️ Certificate expires in $days_until_expiry days: $cert_file"
    else
        log "✅ Certificate is valid for $days_until_expiry days: $cert_file"
    fi
}

usage() {
    cat << EOF
Usage: $0 <command> [options]

Commands:
    dev         Generate development certificates
    staging     Generate staging certificates with Let's Encrypt
    validate    Validate existing certificates
    expiry      Check certificate expiry dates
    help        Show this help message

Options:
    --domain    Domain name for certificate (staging only)
    --email     Email for Let's Encrypt registration

Examples:
    $0 dev
    $0 staging --domain staging.school-erp.com --email admin@school-erp.com
    $0 validate dev/server.crt dev/server.key
    $0 expiry dev/server.crt

Environment Variables:
    STAGING_DOMAIN    Domain for staging certificates
    CERT_EMAIL        Email for certificate registration
EOF
}

main() {
    local command="${1:-help}"
    
    case "$command" in
        dev)
            generate_dev_certificates
            ;;
        staging)
            generate_staging_certificates
            ;;
        validate)
            if [[ $# -lt 3 ]]; then
                error "Usage: $0 validate <cert_file> <key_file>"
                exit 1
            fi
            validate_certificate "$2" "$3"
            ;;
        expiry)
            if [[ $# -lt 2 ]]; then
                error "Usage: $0 expiry <cert_file>"
                exit 1
            fi
            check_certificate_expiry "$2"
            ;;
        help)
            usage
            ;;
        *)
            error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            STAGING_DOMAIN="$2"
            shift 2
            ;;
        --email)
            CERT_EMAIL="$2"
            shift 2
            ;;
        *)
            break
            ;;
    esac
done

main "$@"
