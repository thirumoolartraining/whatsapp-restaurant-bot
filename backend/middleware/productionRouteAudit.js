const Logger = require('../services/logger');

const logger = new Logger('productionSecurity');

// Known test/debug route prefixes that should not exist in production
const FORBIDDEN_ROUTE_PREFIXES = [
  '/api/webhook/test',
  '/api/webhook/test-menu',
  '/api/webhook/simulate',
  '/api/webhook/debug',
  '/api/test-sheets',
  '/api/sync-cancelled',
  '/api/sync-pending-refunds',
  '/api/auth/test-push',
  '/api/auth/test-notification',
  '/api/orders/test-notification',
  '/api/delivery/test-notification',
  '/api/whatsapp-broadcast/test-send'
];

/**
 * Middleware that runs ONLY in production to detect and audit
 * attempts to access test/debug routes that should not exist.
 * 
 * This middleware:
 * - Runs early but safely in the middleware chain
 * - Detects requests targeting known test/debug route prefixes
 * - Emits structured audit logs for security monitoring
 * - Responds with 404 (not found) to avoid leaking route existence
 * - Does NOT affect normal routes
 */
const productionRouteAudit = (req, res, next) => {
  // Only run in production environment
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const { method, originalUrl, ip } = req;
  const userAgent = req.get('User-Agent') || 'unknown';
  const correlationId = req.headers['x-correlation-id'] || logger.generateCorrelationId();

  // Check if the request targets any forbidden test/debug route
  const isForbiddenRoute = FORBIDDEN_ROUTE_PREFIXES.some(prefix => 
    originalUrl.startsWith(prefix)
  );

  if (isForbiddenRoute) {
    // Emit structured audit log event
    logger.warn('forbidden_route_attempt', {
      level: 'warn',
      component: 'productionSecurity',
      event: 'forbidden_route_attempt',
      timestamp: new Date().toISOString(),
      context: {
        route: originalUrl,
        method,
        ip,
        userAgent,
        correlationId,
        environment: process.env.NODE_ENV
      }
    });

    // Respond with 404 to avoid leaking route existence
    return res.status(404).json({
      success: false,
      error: 'Not Found'
    });
  }

  // Continue for normal routes
  next();
};

module.exports = productionRouteAudit;
