/**
 * Global Express Error Handler
 * Phase 1: Stabilization & Correctness ONLY
 * Phase 4.0: Observability Baseline
 */

const Logger = require('../services/logger');

const logger = new Logger('errorHandler');

const errorHandler = (err, req, res, next) => {
  // Extract correlation ID from request if available
  const correlationId = req.headers['x-correlation-id'] || req.id || null;
  const messageId = req.headers['x-message-id'] || null;
  
  // Determine error category based on error type and status
  let errorCategory = 'unknown';
  let errorCode = err.code || null;
  
  if (err.name === 'ValidationError') {
    errorCategory = 'validation';
  } else if (err.name === 'CastError') {
    errorCategory = 'invalid_input';
  } else if (err.code === 11000) {
    errorCategory = 'duplicate';
  } else if (err.status >= 400 && err.status < 500) {
    errorCategory = 'client_error';
  } else if (err.status >= 500) {
    errorCategory = 'server_error';
  }
  
  // Log error with structured format
  logger.logError(err, 'errorHandler', errorCategory, errorCode, correlationId, messageId);

  // Prepare error response
  const isProduction = process.env.NODE_ENV === "production";
  const errorResponse = {
    success: false,
    error: {
      message: isProduction ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
      code: err.code || null,
      requestId: req.id || null
    }
  };

  // Send JSON response
  res.status(err.status || 500).json(errorResponse);
};

module.exports = errorHandler;

/*
STEP 2A COMPLETE WHEN:
[ ] In production, no stack trace is returned in API responses
[ ] In non-production, stack trace may appear
[ ] No other files were modified
[ ] Behavior unchanged for successful requests
*/
