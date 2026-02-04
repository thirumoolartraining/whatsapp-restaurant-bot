const envSchema = require('./envSchema');

function validateEnv() {
  const errors = [];

  // Check required environment variables
  for (const [category, keys] of Object.entries(envSchema.required)) {
    for (const key of keys) {
      const value = process.env[key];
      
      if (value === undefined || value === '') {
        errors.push(`${key} (${category})`);
      } else if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`${key} (${category} - invalid format)`);
      }
    }
  }

  // If there are validation errors, throw an error
  if (errors.length > 0) {
    const errorMessage = `Missing or invalid environment variables:\n${errors.join('\n')}`;
    console.error('Configuration Error:', errorMessage);
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
