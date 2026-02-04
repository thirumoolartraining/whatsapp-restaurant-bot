/**
 * Global Express Error Handler
 * Phase 1: Stabilization & Correctness ONLY
 */

const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error('Error:', {
    method: req.method,
    url: req.originalUrl,
    message: err.message
  });

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
