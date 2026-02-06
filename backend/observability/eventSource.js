/**
 * Phase 5.5: Event Source Abstraction
 * 
 * Read-only event source for observability APIs.
 * Does not affect runtime behavior.
 * Safe if empty/unavailable.
 */

const { normalizeRawEvent } = require('./eventEnvelope');

/**
 * In-memory event store for observability
 * 
 * This is a simple in-memory implementation for Phase 5.5.
 * In production, this would be replaced with proper event store queries.
 */
class InMemoryEventSource {
  constructor() {
    this.events = new Map(); // correlationId -> events[]
    this.isInitialized = false;
  }

  /**
   * Initialize event source (placeholder implementation)
   * In production, this would connect to real event storage
   */
  async initialize() {
    // Placeholder: In production, load events from persistent storage
    // For Phase 5.5, we start with empty store
    this.isInitialized = true;
  }

  /**
   * Query events by correlation ID
   * 
   * @param {string} correlationId - Correlation identifier
   * @returns {Array} Array of canonical events
   */
  queryByCorrelationId(correlationId) {
    if (!this.isInitialized) {
      return [];
    }

    const events = this.events.get(correlationId) || [];
    return events.map(event => normalizeRawEvent(event));
  }

  /**
   * Search events with filters
   * 
   * @param {Object} filters - Search filters
   * @returns {Array} Array of matching correlation IDs with metadata
   */
  search(filters) {
    if (!this.isInitialized) {
      return [];
    }

    const results = [];
    
    for (const [correlationId, events] of this.events.entries()) {
      const match = this._matchesFilters(events, filters);
      if (match) {
        results.push({
          correlationId,
          firstSeen: events[0]?.timestamp || null,
          lastSeen: events[events.length - 1]?.timestamp || null,
          outcome: this._deriveOutcome(events),
          entityRefs: this._extractEntityRefs(events)
        });
      }
    }

    return results;
  }

  /**
   * Add event to store (for testing/demo purposes)
   * 
   * @param {Object} rawEvent - Raw event object
   */
  addEvent(rawEvent) {
    if (!rawEvent.correlationId) {
      return;
    }

    if (!this.events.has(rawEvent.correlationId)) {
      this.events.set(rawEvent.correlationId, []);
    }

    this.events.get(rawEvent.correlationId).push(rawEvent);
  }

  /**
   * Check if events match search filters
   * 
   * @param {Array} events - Events to check
   * @param {Object} filters - Search filters
   * @returns {boolean} True if matches
   */
  _matchesFilters(events, filters) {
    if (!events || events.length === 0) {
      return false;
    }

    // Filter by correlation ID
    if (filters.correlationId) {
      const correlationId = events[0]?.correlationId;
      if (!correlationId || !correlationId.includes(filters.correlationId)) {
        return false;
      }
    }

    // Filter by phone
    if (filters.phone) {
      const hasPhone = events.some(event => 
        event.phone === filters.phone || 
        (event.entityRefs && event.entityRefs.phone === filters.phone)
      );
      if (!hasPhone) {
        return false;
      }
    }

    // Filter by order ID
    if (filters.orderId) {
      const hasOrderId = events.some(event => 
        event.orderId === filters.orderId || 
        (event.entityRefs && event.entityRefs.orderId === filters.orderId)
      );
      if (!hasOrderId) {
        return false;
      }
    }

    // Filter by time range
    if (filters.from || filters.to) {
      const firstTime = new Date(events[0]?.timestamp).getTime();
      const lastTime = new Date(events[events.length - 1]?.timestamp).getTime();
      
      if (filters.from) {
        const fromTime = new Date(filters.from).getTime();
        if (lastTime < fromTime) {
          return false;
        }
      }
      
      if (filters.to) {
        const toTime = new Date(filters.to).getTime();
        if (firstTime > toTime) {
          return false;
        }
      }
    }

    // Filter by outcome
    if (filters.outcome) {
      const derivedOutcome = this._deriveOutcome(events);
      if (derivedOutcome !== filters.outcome) {
        return false;
      }
    }

    return true;
  }

  /**
   * Derive outcome from events
   * 
   * @param {Array} events - Events to analyze
   * @returns {string} Derived outcome
   */
  _deriveOutcome(events) {
    if (!events || events.length === 0) {
      return 'unknown';
    }

    // Check for terminal failure events
    const hasTerminalFailure = events.some(event => 
      event.level === 'error' || 
      (event.payload && (event.payload.failed === true || event.payload.error !== undefined))
    );

    // Check for deadletter events
    const hasDeadletter = events.some(event => 
      event.eventName === 'job_deadlettered' ||
      (event.payload && event.payload.deadlettered === true)
    );

    // Check for retry events
    const hasRetry = events.some(event => 
      event.eventName.includes('retry') ||
      (event.payload && (event.payload.retried === true || event.payload.retryAttempt !== undefined))
    );

    // Check for success events
    const hasSuccess = events.some(event => 
      event.level === 'info' && 
      (event.payload && (event.payload.success === true || event.payload.completed === true))
    );

    if (hasDeadletter) return 'deadlettered';
    if (hasTerminalFailure) return 'failed';
    if (hasRetry) return 'retried';
    if (hasSuccess) return 'success';
    
    return 'unknown';
  }

  /**
   * Extract key entity references from events
   * 
   * @param {Array} events - Events to analyze
   * @returns {Object} Key entity references
   */
  _extractEntityRefs(events) {
    const refs = {};
    
    for (const event of events) {
      if (event.phone && !refs.phone) refs.phone = event.phone;
      if (event.orderId && !refs.orderId) refs.orderId = event.orderId;
      if (event.messageId && !refs.messageId) refs.messageId = event.messageId;
      
      if (event.entityRefs) {
        if (event.entityRefs.phone && !refs.phone) refs.phone = event.entityRefs.phone;
        if (event.entityRefs.orderId && !refs.orderId) refs.orderId = event.entityRefs.orderId;
        if (event.entityRefs.messageId && !refs.messageId) refs.messageId = event.entityRefs.messageId;
      }
    }

    return refs;
  }
}

// Singleton instance
const eventSource = new InMemoryEventSource();

/**
 * Initialize event source
 */
async function initializeEventSource() {
  await eventSource.initialize();
}

/**
 * Get event source instance
 */
function getEventSource() {
  return eventSource;
}

module.exports = {
  InMemoryEventSource,
  initializeEventSource,
  getEventSource
};
