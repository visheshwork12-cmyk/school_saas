import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import  UserModel from '#domain/models/school/user.model.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { TenantService } from '#core/tenant/services/tenant.service.js';
import { AuthenticationException } from '#shared/exceptions/authentication.exception.js';
import HTTP_STATUS  from '#constants/http-status.js';

/**
 * @description Configures Passport JWT strategy for authentication
 * @returns {Object} Configured Passport instance
 */
const configurePassport = () => {
  const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: baseConfig.jwt.accessSecret,
  };

  passport.use(
    new JwtStrategy(opts, async (jwtPayload, done) => {
      try {
        // Validate tenant
        const tenant = await TenantService.validateTenant(jwtPayload.tenantId, {
          requestId: jwtPayload.requestId,
        });

        // Retrieve user
        const user = await UserModel.findOne({
          _id: jwtPayload.sub,
          tenantId: jwtPayload.tenantId,
          isActive: true,
        }).lean();

        if (!user) {
          await AuditService.log('AUTHENTICATION_FAILED', {
            action: 'jwt_validation',
            error: 'User not found or inactive',
            tenantId: jwtPayload.tenantId,
            userId: jwtPayload.sub,
          }, { tenantId: jwtPayload.tenantId });
          return done(new AuthenticationException('User not found or inactive', HTTP_STATUS.UNAUTHORIZED));
        }

        // Log successful authentication
        await AuditService.log('AUTHENTICATION_SUCCESS', {
          action: 'jwt_validation',
          userId: user._id,
          tenantId: tenant.tenantId,
        }, { tenantId: tenant.tenantId, userId: user._id });

        logger.debug(`User authenticated: ${user._id}`, { tenantId: tenant.tenantId });
        return done(null, user);
      } catch (error) {
        logger.error(`Passport JWT error: ${error.message}`, { tenantId: jwtPayload.tenantId });
        await AuditService.log('AUTHENTICATION_ERROR', {
          action: 'jwt_validation',
          error: error.message,
          tenantId: jwtPayload.tenantId,
        }, { tenantId: jwtPayload.tenantId });
        return done(error);
      }
    })
  );

  logger.info('Passport JWT strategy configured successfully');
  return passport;
};

const passportInstance = configurePassport();

export { passportInstance as passport };