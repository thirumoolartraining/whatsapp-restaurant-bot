/*
 Phase 2 Step 5:
 Conservative rate limiting for auth, admin, and webhook routes.
 Designed to reduce abuse without blocking valid traffic.
*/

const rateLimit = require('express-rate-limit');

// In-memory store for rate limiting
const MemoryStore = require('express-rate-limit').MemoryStore;

// Auth routes rate limiter - low threshold to prevent brute force
const authLimiter = rateLimit({
  store: new MemoryStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Don't limit health check or verification endpoints
    return req.path === '/verify' || req.path === '/health';
  }
});

// Admin routes rate limiter - moderate threshold
const adminLimiter = rateLimit({
  store: new MemoryStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many admin requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Webhook rate limiter - high threshold to avoid blocking Meta retries
const webhookLimiter = rateLimit({
  store: new MemoryStore(),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // High limit for Meta webhook traffic
  message: { error: 'Webhook rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Don't limit GET requests (webhook verification)
    return req.method === 'GET';
  }
});

module.exports = {
  authLimiter,
  adminLimiter,
  webhookLimiter
};

// STEP 2-5 COMPLETE WHEN:
// [ ] Auth routes are rate limited
// [ ] Admin routes are rate limited
// [ ] Webhook route is rate limited conservatively
// [ ] Rate limiting does not block valid Meta traffic
// [ ] CORS has explicit origins (no wildcard in prod)
// [ ] Phase 1 & Phase 2 invariants preserved
// [ ] Removing middleware restores previous behavior
