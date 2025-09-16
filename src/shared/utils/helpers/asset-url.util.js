// src/shared/utils/asset-url.util.js
export class AssetUrlHelper {
  static getImageUrl(publicId, options = {}) {
    const {
      width,
      height,
      quality = 'auto',
      format = 'auto',
      tenantId,
      fallback = '/images/placeholder.jpg'
    } = options;

    if (!publicId) return fallback;

    // Build API endpoint for asset URL generation
    const params = new URLSearchParams({
      publicId,
      ...(width && { width }),
      ...(height && { height }),
      ...(quality !== 'auto' && { quality }),
      ...(format !== 'auto' && { format }),
      ...(tenantId && { tenantId })
    });

    return `/api/v1/files/asset-url?${params.toString()}`;
  }

  static getResponsiveImageSrcSet(publicId, tenantId, breakpoints = [400, 800, 1200]) {
    return breakpoints
      .map(width => {
        const url = this.getImageUrl(publicId, { width, tenantId });
        return `${url} ${width}w`;
      })
      .join(', ');
  }

  static getResponsiveImageSizes(breakpoints = ['400px', '800px', '1200px']) {
    return breakpoints
      .map((bp, index) => {
        if (index === breakpoints.length - 1) {
          return bp; // Last breakpoint without media query
        }
        return `(max-width: ${bp}) ${bp}`;
      })
      .join(', ');
  }

  static preloadCriticalImages(imageConfigs = []) {
    imageConfigs.forEach(config => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = this.getImageUrl(config.publicId, config.options);
      if (config.media) link.media = config.media;
      document.head.appendChild(link);
    });
  }
}
