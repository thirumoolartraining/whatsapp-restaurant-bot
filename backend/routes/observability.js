/**
 * Phase 5.5: Observability API Router
 * 
 * Read-only internal observability APIs.
 * Exposes Phase 5 truth via internal HTTP endpoints.
 */

const express = require('express');
const router = express.Router();

// Phase 5 builders
const { buildTimeline } = require('../observability/timelineBuilder');
const { buildFailureNarrative } = require('../observability/failureNarrativeBuilder');
const { buildThrottleView } = require('../observability/throttleViewBuilder');
const { buildRetryView } = require('../observability/retryViewBuilder');

// Event source
const { getEventSource } = require('../observability/eventSource');

/**
 * Helper function to safely execute builders and handle errors
 */
function safeExecute(builder, ...args) {
  try {
    const result = builder(...args);
    return { success: true, data: result };
  } catch (error) {
    return { 
      success: false, 
      error: { 
        code: 'BUILDER_ERROR', 
        message: error.message 
      } 
    };
  }
}

/**
 * Helper function to create API response
 */
function createResponse(success, data = null, error = null) {
  if (success) {
    return { success, data };
  } else {
    return { success, error };
  }
}

/**
 * GET /observability/timeline/:correlationId
 * 
 * Returns timeline for a correlation ID
 */
router.get('/timeline/:correlationId', async (req, res) => {
  const { correlationId } = req.params;
  
  if (!correlationId) {
    return res.status(400).json(
      createResponse(false, null, { 
        code: 'MISSING_CORRELATION_ID', 
        message: 'Correlation ID is required' 
      })
    );
  }

  try {
    const eventSource = getEventSource();
    const events = eventSource.queryByCorrelationId(correlationId);
    
    if (!events || events.length === 0) {
      return res.status(404).json(
        createResponse(false, null, { 
          code: 'NO_EVENTS_FOUND', 
          message: 'No events found for correlation ID' 
        })
      );
    }

    const timelineResult = safeExecute(buildTimeline, correlationId, { events });
    
    if (!timelineResult.success) {
      return res.status(500).json(createResponse(false, null, timelineResult.error));
    }

    const timeline = timelineResult.data;
    
    res.json(createResponse(true, {
      correlationId,
      timelineSteps: timeline.steps,
      metadata: {
        gapDetected: timeline.metadata.gapDetected,
        gapReason: timeline.metadata.gapReason,
        missingPhases: timeline.metadata.missingPhases,
        totalSteps: timeline.metadata.totalSteps,
        startTime: timeline.metadata.startTime,
        endTime: timeline.metadata.endTime,
        version: timeline.metadata.version
      }
    }));

  } catch (error) {
    res.status(500).json(
      createResponse(false, null, { 
        code: 'INTERNAL_ERROR', 
        message: 'Internal server error' 
      })
    );
  }
});

/**
 * GET /observability/failure/:correlationId
 * 
 * Returns failure narrative for a correlation ID
 */
router.get('/failure/:correlationId', async (req, res) => {
  const { correlationId } = req.params;
  
  if (!correlationId) {
    return res.status(400).json(
      createResponse(false, null, { 
        code: 'MISSING_CORRELATION_ID', 
        message: 'Correlation ID is required' 
      })
    );
  }

  try {
    const eventSource = getEventSource();
    const events = eventSource.queryByCorrelationId(correlationId);
    
    if (!events || events.length === 0) {
      return res.status(404).json(
        createResponse(false, null, { 
          code: 'NO_EVENTS_FOUND', 
          message: 'No events found for correlation ID' 
        })
      );
    }

    // Build timeline first (required for failure narrative)
    const timelineResult = safeExecute(buildTimeline, correlationId, { events });
    
    if (!timelineResult.success) {
      return res.status(500).json(createResponse(false, null, timelineResult.error));
    }

    const timeline = timelineResult.data;
    
    // Build failure narrative
    const failureResult = safeExecute(buildFailureNarrative, timeline);
    
    if (!failureResult.success) {
      return res.status(500).json(createResponse(false, null, failureResult.error));
    }

    const failureNarrative = failureResult.data;
    
    res.json(createResponse(true, {
      correlationId,
      failureNarrative: {
        failed: failureNarrative.failed,
        errorCategory: failureNarrative.errorCategory,
        origin: failureNarrative.origin,
        finality: failureNarrative.finality,
        where: failureNarrative.where,
        eventName: failureNarrative.eventName,
        why: failureNarrative.why,
        attempts: failureNarrative.attempts,
        terminalEventRef: failureNarrative.terminalEventRef
      }
    }));

  } catch (error) {
    res.status(500).json(
      createResponse(false, null, { 
        code: 'INTERNAL_ERROR', 
        message: 'Internal server error' 
      })
    );
  }
});

/**
 * GET /observability/throttle/:correlationId
 * 
 * Returns throttle view for a correlation ID
 */
router.get('/throttle/:correlationId', async (req, res) => {
  const { correlationId } = req.params;
  
  if (!correlationId) {
    return res.status(400).json(
      createResponse(false, null, { 
        code: 'MISSING_CORRELATION_ID', 
        message: 'Correlation ID is required' 
      })
    );
  }

  try {
    const eventSource = getEventSource();
    const events = eventSource.queryByCorrelationId(correlationId);
    
    if (!events || events.length === 0) {
      return res.status(404).json(
        createResponse(false, null, { 
          code: 'NO_EVENTS_FOUND', 
          message: 'No events found for correlation ID' 
        })
      );
    }

    const throttleResult = safeExecute(buildThrottleView, correlationId, events);
    
    if (!throttleResult.success) {
      return res.status(500).json(createResponse(false, null, throttleResult.error));
    }

    const throttleView = throttleResult.data;
    
    res.json(createResponse(true, {
      correlationId,
      throttleView: throttleView.toObject()
    }));

  } catch (error) {
    res.status(500).json(
      createResponse(false, null, { 
        code: 'INTERNAL_ERROR', 
        message: 'Internal server error' 
      })
    );
  }
});

/**
 * GET /observability/retry/:correlationId
 * 
 * Returns retry view for a correlation ID
 */
router.get('/retry/:correlationId', async (req, res) => {
  const { correlationId } = req.params;
  
  if (!correlationId) {
    return res.status(400).json(
      createResponse(false, null, { 
        code: 'MISSING_CORRELATION_ID', 
        message: 'Correlation ID is required' 
      })
    );
  }

  try {
    const eventSource = getEventSource();
    const events = eventSource.queryByCorrelationId(correlationId);
    
    if (!events || events.length === 0) {
      return res.status(404).json(
        createResponse(false, null, { 
          code: 'NO_EVENTS_FOUND', 
          message: 'No events found for correlation ID' 
        })
      );
    }

    const retryResult = safeExecute(buildRetryView, correlationId, events);
    
    if (!retryResult.success) {
      return res.status(500).json(createResponse(false, null, retryResult.error));
    }

    const retryView = retryResult.data;
    
    res.json(createResponse(true, {
      correlationId,
      retryView: retryView.toObject()
    }));

  } catch (error) {
    res.status(500).json(
      createResponse(false, null, { 
        code: 'INTERNAL_ERROR', 
        message: 'Internal server error' 
      })
    );
  }
});

/**
 * GET /observability/search
 * 
 * Search for correlation IDs by filters
 * 
 * Query params (all optional, AND-combinable):
 * - correlationId: partial match
 * - phone: exact match
 * - orderId: exact match  
 * - from: ISO/epoch timestamp
 * - to: ISO/epoch timestamp
 * - outcome: success|failed|retried|deadlettered|unknown
 */
router.get('/search', async (req, res) => {
  try {
    const filters = {
      correlationId: req.query.correlationId,
      phone: req.query.phone,
      orderId: req.query.orderId,
      from: req.query.from,
      to: req.query.to,
      outcome: req.query.outcome
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === '') {
        delete filters[key];
      }
    });

    const eventSource = getEventSource();
    const results = eventSource.search(filters);
    
    res.json(createResponse(true, {
      results: results.map(result => ({
        correlationId: result.correlationId,
        timestampRange: {
          firstSeen: result.firstSeen,
          lastSeen: result.lastSeen
        },
        outcome: result.outcome,
        keyEntityRefs: result.entityRefs
      }))
    }));

  } catch (error) {
    res.status(500).json(
      createResponse(false, null, { 
        code: 'INTERNAL_ERROR', 
        message: 'Internal server error' 
      })
    );
  }
});

module.exports = router;
