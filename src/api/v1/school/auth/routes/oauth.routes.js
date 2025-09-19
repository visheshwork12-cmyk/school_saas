// src/api/v1/school/auth/routes/oauth.routes.js
import { Router } from 'express';
import passport from 'passport';
import { OAuthService } from '#core/auth/services/oauth.service.js';
import { JWTService } from '#core/auth/services/jwt.service.js';
import { logger } from '#utils/core/logger.js';
import catchAsync from '#utils/core/catchAsync.js';

const oauthRoutes = Router();

// Initialize OAuth strategies
OAuthService.initialize();

/**
 * @swagger
 * /api/v1/auth/google:
 *   get:
 *     summary: Initiate Google OAuth
 *     tags: [OAuth]
 */
oauthRoutes.get('/google', (req, res, next) => {
  const state = req.query.redirect || '/dashboard';
  req.session.oauthRedirect = state;
  
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
});

/**
 * Google OAuth callback
 */
oauthRoutes.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  catchAsync(async (req, res) => {
    const user = req.user;
    const redirectUrl = req.session.oauthRedirect || '/dashboard';
    
    // Generate JWT tokens
    const tokens = await JWTService.generateTokens(user);
    
    // Set tokens in HTTP-only cookies for security
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect to frontend with success
    res.redirect(`${redirectUrl}?oauth=success`);
  })
);

/**
 * Microsoft OAuth routes
 */
oauthRoutes.get('/microsoft', (req, res, next) => {
  const state = req.query.redirect || '/dashboard';
  req.session.oauthRedirect = state;
  
  passport.authenticate('microsoft')(req, res, next);
});

oauthRoutes.get('/microsoft/callback',
  passport.authenticate('microsoft', { session: false }),
  catchAsync(async (req, res) => {
    const user = req.user;
    const redirectUrl = req.session.oauthRedirect || '/dashboard';
    
    const tokens = await JWTService.generateTokens(user);
    
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.redirect(`${redirectUrl}?oauth=success`);
  })
);

/**
 * Get OAuth providers configuration
 */
oauthRoutes.get('/providers', (req, res) => {
  const providers = [];
  
  if (baseConfig.oauth?.google?.clientId) {
    providers.push({
      name: 'google',
      displayName: 'Google',
      authUrl: '/api/v1/auth/oauth/google'
    });
  }
  
  if (baseConfig.oauth?.microsoft?.clientId) {
    providers.push({
      name: 'microsoft',
      displayName: 'Microsoft',
      authUrl: '/api/v1/auth/oauth/microsoft'
    });
  }

  res.json({
    success: true,
    data: { providers }
  });
});

export default oauthRoutes;
