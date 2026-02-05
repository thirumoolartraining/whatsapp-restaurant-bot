/**
 * Retry Policy Module
 * Phase 4.3: Retry Policy Contract - Step 1
 * 
 * Pure functions for determining retry eligibility and backoff timing.
 * No I/O, no side effects, deterministic behavior.
 */

/**
 * Determine if a job should be retried based on error and attempt information
 * @param {Object} input - Retry decision input
 * @param {string|null} input.errorCategory - 'policy' | 'transient' | null
 * @param {number|null} input.httpStatus - HTTP status code if available
 * @param {string|null} input.errorCode - Error code if available
 * @param {number} input.attemptNumber - Current attempt number (1-based)
 * @param {number} input.maxAttempts - Maximum allowed attempts
 * @returns {boolean} Whether retry should be allowed
 */
function shouldRetry({ errorCategory, httpStatus, errorCode, attemptNumber, maxAttempts }) {
  // If errorCategory === 'policy' → ALWAYS false
  if (errorCategory === 'policy') {
    return false;
  }

  // If errorCategory === 'transient' → true only when attemptNumber < maxAttempts
  if (errorCategory === 'transient') {
    return attemptNumber < maxAttempts;
  }

  // If errorCategory is missing → default false (conservative)
  return false;
}

/**
 * Get backoff delay in milliseconds for the next attempt
 * @param {number} attemptNumber - The attempt number for which to calculate backoff
 * @returns {number} Backoff delay in milliseconds
 */
function getBackoffMs(attemptNumber) {
  switch (attemptNumber) {
    case 2:
      return 10000;  // 10 seconds
    case 3:
      return 60000;  // 1 minute
    default:
      return 0;      // No backoff for other attempts
  }
}

/**
 * Classify the retry reason for logging and decision tracking
 * @param {Object} input - Classification input
 * @param {string|null} input.errorCategory - 'policy' | 'transient' | null
 * @param {boolean} input.shouldRetry - Whether retry is allowed
 * @param {number} input.attemptNumber - Current attempt number (1-based)
 * @param {number} input.maxAttempts - Maximum allowed attempts
 * @returns {string} Classification reason string
 */
function classifyRetryReason({ errorCategory, shouldRetry, attemptNumber, maxAttempts }) {
  if (errorCategory === 'policy') {
    return 'policy_never_retry';
  }

  if (errorCategory === 'transient') {
    if (shouldRetry) {
      return 'transient_retry_allowed';
    } else {
      return 'attempts_exhausted';
    }
  }

  if (!errorCategory) {
    return 'no_category_no_retry';
  }

  return 'unknown_no_retry';
}

module.exports = {
  shouldRetry,
  getBackoffMs,
  classifyRetryReason
};
