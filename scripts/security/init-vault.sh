#!/bin/bash
# scripts/security/init-vault.sh
set -euo pipefail

VAULT_ADDR=${VAULT_ADDR:-"https://vault.your-domain.com"}
VAULT_NAMESPACE="school-erp"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] VAULT-INIT: $*"
}

initialize_vault() {
    log "🔐 Initializing HashiCorp Vault..."
    
    # Initialize Vault (if not already initialized)
    if ! vault status &>/dev/null; then
        log "Initializing Vault..."
        vault operator init \
            -key-shares=5 \
            -key-threshold=3 \
            -format=json > vault-keys.json
        
        log "✅ Vault initialized. Keys saved to vault-keys.json"
        log "⚠️  Store these keys securely!"
    else
        log "Vault already initialized"
    fi
    
    # Unseal Vault
    log "Unsealing Vault..."
    local unseal_keys=$(jq -r '.unseal_keys_b64[]' vault-keys.json | head -3)
    for key in $unseal_keys; do
        vault operator unseal "$key"
    done
    
    # Login with root token
    local root_token=$(jq -r '.root_token' vault-keys.json)
    vault auth "$root_token"
    
    log "✅ Vault unsealed and authenticated"
}

configure_vault_auth() {
    log "🔧 Configuring Vault authentication..."
    
    # Enable Kubernetes auth
    vault auth enable kubernetes
    
    # Configure Kubernetes auth
    vault write auth/kubernetes/config \
        token_reviewer_jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
        kubernetes_host="https://${KUBERNETES_PORT_443_TCP_ADDR}:443" \
        kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    
    # Create policy for school-erp
    vault policy write school-erp-policy - <<EOF
path "secret/data/school-erp/*" {
  capabilities = ["read"]
}
path "secret/metadata/school-erp/*" {
  capabilities = ["read", "list"]
}
EOF
    
    # Create Kubernetes role
    vault write auth/kubernetes/role/school-erp-role \
        bound_service_account_names=school-erp-service-account \
        bound_service_account_namespaces=$VAULT_NAMESPACE \
        policies=school-erp-policy \
        ttl=24h
    
    log "✅ Vault authentication configured"
}

setup_secrets() {
    log "🔑 Setting up application secrets..."
    
    # Enable KV v2 secrets engine
    vault secrets enable -path=secret kv-v2
    
    # Store application secrets
    vault kv put secret/school-erp/api \
        jwt_access_secret="$(openssl rand -base64 32)" \
        jwt_refresh_secret="$(openssl rand -base64 32)"
    
    vault kv put secret/school-erp/database \
        mongodb_uri="$MONGODB_URI"
    
    vault kv put secret/school-erp/cache \
        redis_url="$REDIS_URL"
    
    vault kv put secret/school-erp/aws \
        access_key_id="$AWS_ACCESS_KEY_ID" \
        secret_access_key="$AWS_SECRET_ACCESS_KEY"
    
    vault kv put secret/school-erp/cloudinary \
        api_secret="$CLOUDINARY_API_SECRET"
    
    vault kv put secret/school-erp/monitoring \
        sentry_dsn="$SENTRY_DSN"
    
    log "✅ Application secrets stored in Vault"
}

# Main execution
export VAULT_ADDR
initialize_vault
configure_vault_auth
setup_secrets

log "🎉 Vault setup completed successfully!"
log "📋 Next steps:"
log "1. Secure the vault-keys.json file"
log "2. Deploy External Secrets Operator"
log "3. Apply external secrets configuration"
