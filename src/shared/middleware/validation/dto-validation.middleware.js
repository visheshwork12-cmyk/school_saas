// src/shared/middleware/validation/dto-validation.middleware.js

import Joi from 'joi';
import { catchAsync } from '#utils/core/catchAsync.js';
import { ValidationException } from '#exceptions/validation.exception.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Middleware for DTO validation using Joi schema.
 * Validates body, query, params.
 * 
 * @param {Joi.Schema} schema - Joi schema for validation.
 * @returns {Function} Validation middleware.
 * 
 * @example
 * const schema = Joi.object({ name: Joi.string().required() });
 * router.post('/', dtoValidation(schema), controller);
 */
const dtoValidation = (schema) => catchAsync(async (req, res, next) => {
  const data = { ...req.body, ...req.query, ...req.params };

  const { error, value } = schema.validate(data, {
    abortEarly: false, // Get all errors
    stripUnknown: true, // Sanitize unknown fields
    allowUnknown: false, // Security: No unknown fields
  });

  if (error) {
    const messages = error.details.map((d) => d.message).join(', ');
    logger.warn(`Validation error: ${messages}`);
    throw new ValidationException(messages);
  }

  // Overwrite with validated/sanitized data
  Object.assign(req.body, value);

  next();
});

export { dtoValidation };