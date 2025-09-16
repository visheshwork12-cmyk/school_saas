// infrastructure/cloudfront-functions/security-headers.js

function handler(event) {
    var request = event.request;
    var headers = request.headers;
    
    // Add security headers
    headers['x-frame-options'] = { value: 'DENY' };
    headers['x-content-type-options'] = { value: 'nosniff' };
    headers['x-xss-protection'] = { value: '1; mode=block' };
    headers['strict-transport-security'] = { 
        value: 'max-age=31536000; includeSubDomains; preload' 
    };
    
    // Add CSP header for different content types
    var uri = request.uri;
    if (uri.startsWith('/api-docs')) {
        headers['content-security-policy'] = {
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline';"
        };
    } else if (uri.startsWith('/api')) {
        headers['content-security-policy'] = {
            value: "default-src 'self'; script-src 'none'; style-src 'none';"
        };
    }
    
    // Add rate limiting headers
    headers['x-ratelimit-limit'] = { value: '1000' };
    headers['x-ratelimit-window'] = { value: '3600' };
    
    return request;
}
