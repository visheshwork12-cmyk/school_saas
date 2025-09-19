// src/core/auth/services/oauth.service.js
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { AuthenticationException } from '#shared/exceptions/authentication.exception.js';
import baseConfig from '#shared/config/environments/base.config.js';

/**
 * OAuth 2.0 Integration Service
 */
export class OAuthService {
  
  static initialize() {
    this.configureGoogleStrategy();
    this.configureMicrosoftStrategy();
  }

  /**
   * Configure Google OAuth Strategy
   */
  static configureGoogleStrategy() {
    if (!baseConfig.oauth?.google?.clientId) {
      logger.warn('Google OAuth not configured');
      return;
    }

    passport.use('google', new GoogleStrategy({
      clientID: baseConfig.oauth.google.clientId,
      clientSecret: baseConfig.oauth.google.clientSecret,
      callbackURL: baseConfig.oauth.google.callbackUrl || '/api/v1/auth/google/callback',
      scope: ['profile', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await this.handleOAuthUser({
          provider: 'google',
          providerId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          avatar: profile.photos[0]?.value,
          accessToken,
          refreshToken
        });

        return done(null, user);
      } catch (error) {
        logger.error('Google OAuth error', { error: error.message });
        return done(error);
      }
    }));
  }

  /**
   * Configure Microsoft OAuth Strategy
   */
  static configureMicrosoftStrategy() {
    if (!baseConfig.oauth?.microsoft?.clientId) {
      logger.warn('Microsoft OAuth not configured');
      return;
    }

    passport.use('microsoft', new MicrosoftStrategy({
      clientID: baseConfig.oauth.microsoft.clientId,
      clientSecret: baseConfig.oauth.microsoft.clientSecret,
      callbackURL: baseConfig.oauth.microsoft.callbackUrl || '/api/v1/auth/microsoft/callback',
      scope: ['user.read']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await this.handleOAuthUser({
          provider: 'microsoft',
          providerId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          avatar: null,
          accessToken,
          refreshToken
        });

        return done(null, user);
      } catch (error) {
        logger.error('Microsoft OAuth error', { error: error.message });
        return done(error);
      }
    }));
  }

  /**
   * Handle OAuth user authentication/registration
   */
  static async handleOAuthUser(oauthData) {
    const UserModel = (await import('#domain/models/school/user.model.js')).default;
    
    try {
      // Try to find existing user by email or OAuth provider ID
      let user = await UserModel.findOne({
        $or: [
          { email: oauthData.email },
          { [`oauth.${oauthData.provider}.id`]: oauthData.providerId }
        ]
      });

      if (user) {
        // Update existing user with OAuth data
        user.oauth = user.oauth || {};
        user.oauth[oauthData.provider] = {
          id: oauthData.providerId,
          accessToken: oauthData.accessToken,
          refreshToken: oauthData.refreshToken,
          lastLogin: new Date()
        };
        
        user.lastLoginAt = new Date();
        await user.save();

        await AuditService.log('OAUTH_LOGIN_SUCCESS', {
          action: 'oauth_login',
          provider: oauthData.provider,
          userId: user._id,
          email: oauthData.email
        }, { 
          tenantId: user.tenantId, 
          userId: user._id 
        });

        return user;
      }

      // Check if email domain is allowed for auto-registration
      const allowedDomains = baseConfig.oauth.allowedDomains || [];
      const emailDomain = oauthData.email.split('@')[1];
      
      if (!allowedDomains.includes(emailDomain)) {
        throw new AuthenticationException(
          'OAuth registration not allowed for this email domain'
        );
      }

      // Create new user with OAuth data
      user = new UserModel({
        email: oauthData.email,
        firstName: oauthData.firstName,
        lastName: oauthData.lastName,
        displayName: oauthData.name,
        avatar: oauthData.avatar,
        role: 'TEACHER', // Default role for OAuth users
        status: 'ACTIVE',
        emailVerified: true, // OAuth emails are pre-verified
        oauth: {
          [oauthData.provider]: {
            id: oauthData.providerId,
            accessToken: oauthData.accessToken,
            refreshToken: oauthData.refreshToken,
            lastLogin: new Date()
          }
        },
        lastLoginAt: new Date(),
        tenantId: 'default' // Will be updated based on school assignment
      });

      await user.save();

      await AuditService.log('OAUTH_REGISTRATION_SUCCESS', {
        action: 'oauth_registration',
        provider: oauthData.provider,
        userId: user._id,
        email: oauthData.email
      }, { 
        tenantId: user.tenantId, 
        userId: user._id 
      });

      return user;

    } catch (error) {
      logger.error('OAuth user handling failed', { 
        error: error.message, 
        provider: oauthData.provider,
        email: oauthData.email 
      });
      throw error;
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  static getAuthorizationUrl(provider, state) {
    const urls = {
      google: `https://accounts.google.com/oauth/authorize?client_id=${baseConfig.oauth.google.clientId}&redirect_uri=${encodeURIComponent(baseConfig.oauth.google.callbackUrl)}&scope=profile%20email&response_type=code&state=${state}`,
      microsoft: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${baseConfig.oauth.microsoft.clientId}&redirect_uri=${encodeURIComponent(baseConfig.oauth.microsoft.callbackUrl)}&scope=user.read&response_type=code&state=${state}`
    };

    return urls[provider];
  }
}
