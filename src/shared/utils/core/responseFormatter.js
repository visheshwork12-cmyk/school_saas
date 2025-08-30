// src/shared/utils/core/responseFormatter.js

import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { logger } from '#utils/core/logger.js';

/**
 * @description Utility for formatting standardized API responses.
 * Ensures consistent success and error responses with metadata.
 * 
 * @typedef {Object} ResponseOptions
 * @property {Object} [pagination] - Pagination metadata.
 * @property {string} [requestId] - Request ID for tracing.
 * 
 * @example
 * // Success
 * responseFormatter.success(res, 'Operation done', data, { pagination });
 * 
 * // Error
 * responseFormatter.error(res, err, requestId);
 */
const responseFormatter = {
  /**
   * @description Formats and sends a success response.
   * @param {import('express').Response} res - Express response object.
   * @param {string} message - Success message.
   * @param {any} data - Response data.
   * @param {ResponseOptions} [options={}] - Additional options.
   */
  success: (res, message, data, options = {}) => {
    const response = {
      success: true,
      message,
      data,
      meta: {
        timestamp: moment().toISOString(),
        ...(options.pagination && { pagination: options.pagination }),
        ...(options.requestId && { requestId: options.requestId }),
      },
    };

    // Audit log success
    logger.info(`Success response: ${message}`);

    res.status(200).json(response);
  },

  /**
   * @description Formats and sends an error response.
   * @param {import('express').Response} res - Express response object.
   * @param {Error} err - Error object.
   * @param {string} [requestId] - Request ID.
   */
  error: (res, err, requestId) => {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const message = err.message || 'An unexpected error occurred';

    const response = {
      success: false,
      message,
      error: {
        code,
        details: err.details || {},
      },
      meta: {
        timestamp: moment().toISOString(),
        requestId: requestId || uuidv4(),
      },
    };

    // Audit log error
    logger.error(`Error response: ${message} | Code: ${code}`);

    res.status(statusCode).json(response);
  },
};

export { responseFormatter };