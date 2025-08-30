// src/core/tenant/services/tenant-resolver.service.js

import catchAsync from '#utils/core/catchAsync.js';
import { OrganizationRepository } from '#core/repositories/platform/organization.repository.js';
import { AuthenticationException } from '#exceptions/authentication.exception.js';
import config from '#config/index.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Service for resolving tenant context from request.
 * Supports multiple identification methods: subdomain, header, path.
 * Loads tenant data and sets context.
 * 
 * @example
 * const tenantContext = await tenantResolver.resolve(req);
 */
class TenantResolverService {
  constructor() {
    this.orgRepo = new OrganizationRepository();
  }

  /**
   * @description Resolves tenant ID from request based on mode.
   * @param {import('express').Request} req - Express request.
   * @returns {string} Tenant ID.
   * @private
   */
  _extractTenantId(req) {
    const mode = config.multiTenant.mode || 'header';

    switch (mode) {
      case 'subdomain':
        return req.subdomains[0] || config.multiTenant.defaultTenantId;
      case 'header':
        return req.headers[config.multiTenant.tenantHeaderName] || config.multiTenant.defaultTenantId;
      case 'path':
        return req.params.tenantId || config.multiTenant.defaultTenantId;
      default:
        throw new Error('Invalid multi-tenant mode');
    }
  }

  /**
   * @description Resolves and validates tenant context.
   * @param {import('express').Request} req - Request object.
   * @returns {Promise<Object>} Tenant context.
   */
  async resolve(req) {
    try {
      const tenantId = this._extractTenantId(req);

      if (!tenantId) {
        throw new AuthenticationException('Tenant ID required');
      }

      // Load organization with subscription
      const organization = await this.orgRepo.findByTenantId(tenantId);

      if (!organization) {
        throw new AuthenticationException('Invalid tenant');
      }

      // Build context
      const context = {
        tenantId,
        organizationId: organization._id,
        schoolId: req.params.schoolId || null, // To be resolved later
        subscriptionId: organization.subscriptionId,
        plan: organization.subscriptionPlan,
        features: organization.features,
        limits: organization.limits,
      };

      // Audit log
      logger.info(`Tenant resolved: ${tenantId} for request ${req.path}`);

      return context;
    } catch (err) {
      logger.error(`Tenant resolution failed: ${err.message}`);
      throw err;
    }
  }
}

const tenantResolver = new TenantResolverService();

export { TenantResolverService, tenantResolver };