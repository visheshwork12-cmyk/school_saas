import { Router } from "express";
import { logger } from "#utils/core/logger.js";
import { subscriptionGate } from "#shared/middleware/access-control/subscription-gate.middleware.js";

/**
 * @description Router for product-specific endpoints
 * @returns {import('express').Router}
 */
const productsRoutes = Router();

// Apply subscription gate for product routes
productsRoutes.use(subscriptionGate("PRODUCT_ACCESS"));

// Placeholder for product-specific routes
// productsRoutes.use('/academic', academicRoutes);
// productsRoutes.use('/finance', financeRoutes);
// productsRoutes.use('/library', libraryRoutes);

productsRoutes.use((req, res, next) => {
  logger.debug(`Product route accessed: ${req.path}`);
  next();
});

export default productsRoutes;
