// src/shared/middleware/global/helmet.middleware.js

import helmet from "helmet";
import config from "#config/index.js";

/**
 * @description Configured Helmet middleware for security headers.
 * Includes CSP, HSTS, etc., for XSS protection and more.
 *
 * @returns {Function} Helmet middleware.
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Adjust based on needs
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", config.aws.s3Bucket], // For images from S3
      // Add more as needed
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: "deny" }, // Prevent clickjacking
  xssFilter: true,
  noSniff: true,
  hidePoweredBy: true,
});

export { helmetMiddleware };
