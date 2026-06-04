const envSchema = require('./envSchema');
const Logger = require('../services/logger');

const logger = new Logger('validateEnv');

function validateEnv() {
  const errors = [];
  const warnings = [];

  // Check required environment variables
  for (const [category, keys] of Object.entries(envSchema.required)) {
    if (category === 'production') {
      // Only validate production-specific vars in production
      if (process.env.NODE_ENV === 'production') {
        for (const [subCategory, subKeys] of Object.entries(keys)) {
          for (const key of subKeys) {
            const value = process.env[key];
            
            if (value === undefined || value === '') {
              errors.push(`${key} (${category}.${subCategory})`);
            } else if (typeof value !== 'string' || value.trim() === '') {
              errors.push(`${key} (${category}.${subCategory} - invalid format)`);
            }
          }
        }
      } else {
        // In non-production, check for missing Meta vars and warn
        for (const [subCategory, subKeys] of Object.entries(keys)) {
          const missingVars = subKeys.filter(key => {
            const value = process.env[key];
            return value === undefined || value === '' || (typeof value === 'string' && value.trim() === '');
          });
          
          if (missingVars.length > 0) {
            warnings.push(`WhatsApp disabled: missing ${missingVars.join(', ')}`);
          }
        }
      }
    } else {
      // Validate all other required categories normally
      for (const key of keys) {
        const value = process.env[key];
        
        if (value === undefined || value === '') {
          errors.push(`${key} (${category})`);
        } else if (typeof value !== 'string' || value.trim() === '') {
          errors.push(`${key} (${category} - invalid format)`);
        }
      }
    }
  }

  const redisConfigured = Boolean(process.env.REDIS_HOST && process.env.REDIS_PORT);
  const queueFallbackAllowed = process.env.QUEUE_FALLBACK_ALLOWED === 'true';

  if (!redisConfigured && !queueFallbackAllowed) {
    errors.push('REDIS_HOST/REDIS_PORT or QUEUE_FALLBACK_ALLOWED=true (queue)');
  }

  if (process.env.NODE_ENV === 'production' && !redisConfigured && queueFallbackAllowed) {
    warnings.push('Production queue is using in-process fallback because Redis is not configured');
  }

  // Log configuration warnings that do not expose secrets
  if (warnings.length > 0) {
    warnings.forEach(warning => {
      logger.warn('environment_validation_warning', {
        errorCategory: 'configuration',
        origin: 'validate_env',
        finality: 'warning',
        warningMessage: warning
      });
    });
  }

  // If there are validation errors, throw an error
  if (errors.length > 0) {
    const errorMessage = `Missing or invalid environment variables:\n${errors.join('\n')}`;
    logger.error('environment_validation_failed', {
      errorCategory: 'configuration',
      origin: 'validate_env',
      finality: 'terminal',
      errorMessage,
      missingVariables: errors
    });
    throw new Error(errorMessage);
  }

  // Validation passed - silent success
}

module.exports = validateEnv;

// STEP 2-4 COMPLETE WHEN:
// [ ] All required env keys validated at startup
// [ ] Missing/invalid env causes fail-fast shutdown
// [ ] No secrets logged
// [ ] No env key renames
// [ ] Phase 1 & Phase 2 invariants preserved
// [ ] Removing validation restores previous startup behavior
