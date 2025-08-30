# SSL/TLS Certificate Management

This directory contains SSL/TLS certificates and related configuration for the School ERP SaaS application.

## Directory Structure


## Certificate Types

### Development Certificates
- Self-signed certificates for local development
- Generated automatically by the setup script
- Valid for localhost and common development domains

### Staging Certificates  
- Let's Encrypt certificates for staging environment
- Automatically renewed via certbot

### Production Certificates
- Commercial SSL certificates or Let's Encrypt
- Stored encrypted and deployed securely
- Include proper chain certificates

## Security Guidelines

1. **Never commit private keys to version control**
2. **Use encrypted storage for production certificates**  
3. **Implement proper certificate rotation**
4. **Monitor certificate expiration dates**
5. **Use strong cipher suites and protocols**

## Certificate Management Commands

