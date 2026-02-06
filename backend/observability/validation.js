/**
 * Phase 5.6 Step 3: Observability Input Validation
 * 
 * Pure validation helpers for observability endpoints.
 * Does not throw, returns structured validation results.
 */

/**
 * Validate correlation ID format
 * 
 * @param {string} correlationId - Correlation identifier to validate
 * @returns {Object} Validation result { ok: boolean, value?, error? }
 */
function validateCorrelationId(correlationId) {
  if (!correlationId) {
    return {
      ok: false,
      error: 'Correlation ID is required'
    };
  }

  if (typeof correlationId !== 'string') {
    return {
      ok: false,
      error: 'Correlation ID must be a string'
    };
  }

  // Length validation (1-100 characters)
  if (correlationId.length < 1 || correlationId.length > 100) {
    return {
      ok: false,
      error: 'Correlation ID must be between 1 and 100 characters'
    };
  }

  // Character validation (only A-Za-z0-9 allowed)
  const validPattern = /^[A-Za-z0-9]+$/;
  if (!validPattern.test(correlationId)) {
    return {
      ok: false,
      error: 'Correlation ID can only contain letters and numbers'
    };
  }

  return {
    ok: true,
    value: correlationId
  };
}

/**
 * Validate phone number format
 * 
 * @param {string} phone - Phone number to validate
 * @returns {Object} Validation result { ok: boolean, value?, error? }
 */
function validatePhone(phone) {
  if (!phone) {
    return { ok: true }; // Optional field
  }

  if (typeof phone !== 'string') {
    return {
      ok: false,
      error: 'Phone number must be a string'
    };
  }

  // Length validation (7-16 characters)
  if (phone.length < 7 || phone.length > 16) {
    return {
      ok: false,
      error: 'Phone number must be between 7 and 16 characters'
    };
  }

  // Phone validation (digits + optional leading +)
  const phonePattern = /^\+?[0-9]+$/;
  if (!phonePattern.test(phone)) {
    return {
      ok: false,
      error: 'Phone number can only contain digits and optional leading +'
    };
  }

  return {
    ok: true,
    value: phone
  };
}

/**
 * Validate order ID format
 * 
 * @param {string} orderId - Order ID to validate
 * @returns {Object} Validation result { ok: boolean, value?, error? }
 */
function validateOrderId(orderId) {
  if (!orderId) {
    return { ok: true }; // Optional field
  }

  if (typeof orderId !== 'string') {
    return {
      ok: false,
      error: 'Order ID must be a string'
    };
  }

  // Length validation (1-64 characters)
  if (orderId.length < 1 || orderId.length > 64) {
    return {
      ok: false,
      error: 'Order ID must be between 1 and 64 characters'
    };
  }

  return {
    ok: true,
    value: orderId
  };
}

/**
 * Validate timestamp format (ISO or epoch)
 * 
 * @param {string} timestamp - Timestamp to validate
 * @returns {Object} Validation result { ok: boolean, value?, error? }
 */
function validateTimestamp(timestamp) {
  if (!timestamp) {
    return { ok: true }; // Optional field
  }

  if (typeof timestamp !== 'string') {
    return {
      ok: false,
      error: 'Timestamp must be a string'
    };
  }

  // Try epoch number first
  const epochMatch = /^\d+$/.test(timestamp);
  if (epochMatch) {
    const epoch = parseInt(timestamp, 10);
    // Check reasonable epoch range (year 2000 to year 2100)
    if (epoch < 946684800000 || epoch > 4102444800000) {
      return {
        ok: false,
        error: 'Timestamp epoch value out of reasonable range'
      };
    }
    return {
      ok: true,
      value: new Date(epoch).toISOString()
    };
  }

  // Try ISO format
  const isoDate = new Date(timestamp);
  if (isNaN(isoDate.getTime())) {
    return {
      ok: false,
      error: 'Timestamp must be a valid ISO date string or epoch milliseconds'
    };
  }

  return {
    ok: true,
    value: isoDate.toISOString()
  };
}

/**
 * Validate outcome enum value
 * 
 * @param {string} outcome - Outcome to validate
 * @returns {Object} Validation result { ok: boolean, value?, error? }
 */
function validateOutcome(outcome) {
  if (!outcome) {
    return { ok: true }; // Optional field
  }

  if (typeof outcome !== 'string') {
    return {
      ok: false,
      error: 'Outcome must be a string'
    };
  }

  const validOutcomes = ['success', 'failed', 'retried', 'deadlettered', 'unknown'];
  if (!validOutcomes.includes(outcome)) {
    return {
      ok: false,
      error: `Outcome must be one of: ${validOutcomes.join(', ')}`
    };
  }

  return {
    ok: true,
    value: outcome
  };
}

/**
 * Validate time range (from/to timestamps)
 * 
 * @param {string} from - Start timestamp
 * @param {string} to - End timestamp
 * @returns {Object} Validation result { ok: boolean, value?, error? }
 */
function validateTimeRange(from, to) {
  const fromResult = validateTimestamp(from);
  if (!fromResult.ok) {
    return fromResult;
  }

  const toResult = validateTimestamp(to);
  if (!toResult.ok) {
    return toResult;
  }

  // If both timestamps are provided, validate ordering and range
  if (from && to) {
    const fromTime = new Date(fromResult.value).getTime();
    const toTime = new Date(toResult.value).getTime();

    // Validate ordering
    if (fromTime >= toTime) {
      return {
        ok: false,
        error: 'From timestamp must be before to timestamp'
      };
    }

    // Enforce max window (7 days) to prevent expensive scans
    const maxWindowMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (toTime - fromTime > maxWindowMs) {
      return {
        ok: false,
        error: 'Time range cannot exceed 7 days'
      };
    }
  }

  return {
    ok: true,
    value: {
      from: fromResult.value,
      to: toResult.value
    }
  };
}

/**
 * Validate search query parameters
 * 
 * @param {Object} query - Query parameters object
 * @returns {Object} Validation result { ok: boolean, value?, error? }
 */
function validateSearchQuery(query) {
  const result = {
    ok: true,
    value: {},
    errors: []
  };

  // Validate correlationId filter
  if (query.correlationId !== undefined) {
    const correlationIdResult = validateCorrelationId(query.correlationId);
    if (!correlationIdResult.ok) {
      result.ok = false;
      result.errors.push(`correlationId: ${correlationIdResult.error}`);
    } else {
      result.value.correlationId = correlationIdResult.value;
    }
  }

  // Validate phone filter
  if (query.phone !== undefined) {
    const phoneResult = validatePhone(query.phone);
    if (!phoneResult.ok) {
      result.ok = false;
      result.errors.push(`phone: ${phoneResult.error}`);
    } else {
      result.value.phone = phoneResult.value;
    }
  }

  // Validate orderId filter
  if (query.orderId !== undefined) {
    const orderIdResult = validateOrderId(query.orderId);
    if (!orderIdResult.ok) {
      result.ok = false;
      result.errors.push(`orderId: ${orderIdResult.error}`);
    } else {
      result.value.orderId = orderIdResult.value;
    }
  }

  // Validate time range
  if (query.from !== undefined || query.to !== undefined) {
    const timeRangeResult = validateTimeRange(query.from, query.to);
    if (!timeRangeResult.ok) {
      result.ok = false;
      result.errors.push(`time range: ${timeRangeResult.error}`);
    } else {
      if (timeRangeResult.value.from) result.value.from = timeRangeResult.value.from;
      if (timeRangeResult.value.to) result.value.to = timeRangeResult.value.to;
    }
  }

  // Validate outcome
  if (query.outcome !== undefined) {
    const outcomeResult = validateOutcome(query.outcome);
    if (!outcomeResult.ok) {
      result.ok = false;
      result.errors.push(`outcome: ${outcomeResult.error}`);
    } else {
      result.value.outcome = outcomeResult.value;
    }
  }

  if (!result.ok && result.errors.length > 0) {
    result.error = result.errors.join('; ');
  }

  return result;
}

module.exports = {
  validateCorrelationId,
  validatePhone,
  validateOrderId,
  validateTimestamp,
  validateOutcome,
  validateTimeRange,
  validateSearchQuery
};
