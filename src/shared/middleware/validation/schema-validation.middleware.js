// src/shared/middleware/validation/schema-validation.middleware.js

import catchAsync from '#utils/core/catchAsync.js';
import { ValidationException } from '#exceptions/validation.exception.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Middleware for generic schema validation using Joi.
 * Validates body, query, params.
 * 
 * @param {import('joi').Schema} schema - Joi schema.
 * @returns {Function} Middleware.
 * 
 * @example
 * router.post('/', schemaValidation(loginSchema), controller);
 */
const schemaValidation = (schema) => catchAsync(async (req, res, next) => {
  const data = { ...req.body, ...req.query, ...req.params };
  
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false, // Security
  });

  if (error) {
    const details = error.details.reduce((acc, d) => {
      acc[d.path[0]] = d.message;
      return acc;
    }, {});
    logger.warn(`Validation failed: ${JSON.stringify(details)}`);
    throw new ValidationException('Validation failed', details);
  }

  // Sanitized data
  req.body = value;

  next();
});

export { schemaValidation };