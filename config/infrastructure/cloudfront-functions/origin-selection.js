// infrastructure/cloudfront-functions/origin-selection.js

function handler(event) {
    var request = event.request;
    var uri = request.uri;
    var headers = request.headers;
    
    // Route static assets to S3 origin
    if (uri.startsWith('/static/') || 
        uri.startsWith('/images/') || 
        uri.startsWith('/fonts/') ||
        uri.endsWith('.css') ||
        uri.endsWith('.js') ||
        uri.endsWith('.png') ||
        uri.endsWith('.jpg') ||
        uri.endsWith('.jpeg') ||
        uri.endsWith('.gif') ||
        uri.endsWith('.svg') ||
        uri.endsWith('.ico') ||
        uri.endsWith('.woff') ||
        uri.endsWith('.woff2') ||
        uri.endsWith('.ttf')) {
        
        // Rewrite URI for S3 origin
        request.uri = '/static' + uri;
        
        // Add version parameter for cache busting
        if (!request.querystring.v) {
            request.querystring.v = { value: '1.0.0' };
        }
    }
    
    // Add tenant context for API requests
    if (uri.startsWith('/api/')) {
        // Extract tenant ID from subdomain or header
        var host = headers.host.value;
        var tenantMatch = host.match(/^([^.]+)\.schoolerp\.com$/);
        
        if (tenantMatch && tenantMatch[1] !== 'www' && tenantMatch[1] !== 'cdn') {
            headers['x-tenant-id'] = { value: tenantMatch[1] };
        }
        
        // Add CloudFront identifier
        headers['x-cloudfront-request'] = { value: 'true' };
    }
    
    return request;
}
