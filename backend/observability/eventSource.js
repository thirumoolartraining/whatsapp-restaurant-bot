/**
 * Phase 5.5: Event Source Abstraction
 * 
 * Read-only event source for observability APIs.
 * Does not affect runtime behavior.
 * Safe if empty/unavailable.
 */

const { normalizeRawEvent } = require('./eventEnvelope');

// Configuration with environment variable fallbacks
const EVENT_SOURCE_CONFIG = {
  TTL_MS: process.env.EVENT_SOURCE_TTL_HOURS 
    ? parseInt(process.env.EVENT_SOURCE_TTL_HOURS) * 60 * 60 * 1000 
    : 24 * 60 * 60 * 1000, // 24 hours default
  MAX_CORRELATION_BUCKETS: process.env.EVENT_SOURCE_MAX_BUCKETS 
    ? parseInt(process.env.EVENT_SOURCE_MAX_BUCKETS) 
    : 10000,
  MAX_EVENTS_PER_BUCKET: process.env.EVENT_SOURCE_MAX_EVENTS_PER_BUCKET 
    ? parseInt(process.env.EVENT_SOURCE_MAX_EVENTS_PER_BUCKET) 
    : 1000,
  CLEANUP_INTERVAL_MS: process.env.EVENT_SOURCE_CLEANUP_INTERVAL_MINUTES 
    ? parseInt(process.env.EVENT_SOURCE_CLEANUP_INTERVAL_MINUTES) * 60 * 1000 
    : 60 * 60 * 1000 // 1 hour default
};

/**
 * In-memory event store for observability
 * 
 * Bounded implementation with TTL, size caps, and normalization caching.
 * Safe for production long-running processes.
 */
class InMemoryEventSource {
  constructor() {
    // correlationId -> bucket { rawEvents: [], normalizedEvents: [], lastUpdatedAt: number }
    this.events = new Map();
    this.isInitialized = false;
    this.cleanupTimer = null;
    
    // Performance tracking for cleanup
    this.totalEvents = 0;
  }

  /**
   * Initialize event source with cleanup timer
   */
  async initialize() {
    this.isInitialized = true;
    
    // Start periodic cleanup timer
    this._startCleanupTimer();
  }

  /**
   * Query events by correlation ID (with cached normalization)
   * 
   * @param {string} correlationId - Correlation identifier
   * @returns {Array} Array of canonical events
   */
  queryByCorrelationId(correlationId) {
    if (!this.isInitialized) {
      return [];
    }

    const bucket = this.events.get(correlationId);
    if (!bucket) {
      return [];
    }

    // Update last accessed time for LRU tracking
    bucket.lastUpdatedAt = Date.now();
    
    // Return cached normalized events
    return bucket.normalizedEvents || [];
  }

  /**
   * Search events with filters (optimized for correlationId lookup)
   * 
   * @param {Object} filters - Search filters
   * @returns {Array} Array of matching correlation IDs with metadata
   */
  search(filters) {
    if (!this.isInitialized) {
      return [];
    }

    // Fast path: direct correlationId lookup
    if (filters.correlationId && !filters.phone && !filters.orderId && !filters.from && !filters.to && !filters.outcome) {
      const bucket = this.events.get(filters.correlationId);
      if (bucket && bucket.rawEvents.length > 0) {
        return [{
          correlationId: filters.correlationId,
          firstSeen: bucket.rawEvents[0]?.timestamp || null,
          lastSeen: bucket.rawEvents[bucket.rawEvents.length - 1]?.timestamp || null,
          outcome: this._deriveOutcome(bucket.normalizedEvents),
          entityRefs: this._extractEntityRefs(bucket.normalizedEvents)
        }];
      }
      return [];
    }

    // Full scan path
    const results = [];
    
    for (const [correlationId, bucket] of this.events.entries()) {
      const match = this._matchesFilters(bucket.normalizedEvents, filters);
      if (match) {
        results.push({
          correlationId,
          firstSeen: bucket.rawEvents[0]?.timestamp || null,
          lastSeen: bucket.rawEvents[bucket.rawEvents.length - 1]?.timestamp || null,
          outcome: this._deriveOutcome(bucket.normalizedEvents),
          entityRefs: this._extractEntityRefs(bucket.normalizedEvents)
        });
      }
    }

    return results;
  }

  /**
   * Add event to store with memory bounds and normalization caching
   * 
   * @param {Object} rawEvent - Raw event object
   */
  addEvent(rawEvent) {
    if (!rawEvent.correlationId) {
      return;
    }

    const correlationId = rawEvent.correlationId;
    const now = Date.now();

    // Get or create bucket
    let bucket = this.events.get(correlationId);
    if (!bucket) {
      bucket = {
        rawEvents: [],
        normalizedEvents: [],
        lastUpdatedAt: now
      };
      this.events.set(correlationId, bucket);
    }

    // Add raw event
    bucket.rawEvents.push(rawEvent);
    
    // Normalize and cache
    try {
      const normalized = normalizeRawEvent(rawEvent);
      bucket.normalizedEvents.push(normalized);
    } catch (error) {
      // Normalization should never throw due to fallback, but guard anyway
      bucket.normalizedEvents.push(normalizeRawEvent({
        ...rawEvent,
        eventName: 'normalization_failed',
        level: 'error',
        payload: { originalEvent: rawEvent, error: error.message }
      }));
    }
    
    bucket.lastUpdatedAt = now;
    this.totalEvents++;

    // Enforce per-bucket size limit
    if (bucket.rawEvents.length > EVENT_SOURCE_CONFIG.MAX_EVENTS_PER_BUCKET) {
      const removeCount = bucket.rawEvents.length - EVENT_SOURCE_CONFIG.MAX_EVENTS_PER_BUCKET;
      bucket.rawEvents.splice(0, removeCount);
      bucket.normalizedEvents.splice(0, removeCount);
      this.totalEvents -= removeCount;
    }

    // Enforce total bucket limit with lazy cleanup
    if (this.events.size > EVENT_SOURCE_CONFIG.MAX_CORRELATION_BUCKETS) {
      this._evictOldestBuckets();
    }

    // Lazy cleanup of expired buckets
    this._cleanupExpiredBuckets();
  }

  /**
   * Start periodic cleanup timer
   */
  _startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      try {
        this._cleanupExpiredBuckets();
      } catch (error) {
        // Silently fail - cleanup should never crash the process
      }
    }, EVENT_SOURCE_CONFIG.CLEANUP_INTERVAL_MS);
  }

  /**
   * Cleanup expired buckets based on TTL
   */
  _cleanupExpiredBuckets() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [correlationId, bucket] of this.events.entries()) {
      if (now - bucket.lastUpdatedAt > EVENT_SOURCE_CONFIG.TTL_MS) {
        expiredKeys.push(correlationId);
      }
    }
    
    for (const key of expiredKeys) {
      const bucket = this.events.get(key);
      if (bucket) {
        this.totalEvents -= bucket.rawEvents.length;
        this.events.delete(key);
      }
    }
  }

  /**
   * Evict oldest buckets when over max limit
   */
  _evictOldestBuckets() {
    const excess = this.events.size - EVENT_SOURCE_CONFIG.MAX_CORRELATION_BUCKETS;
    if (excess <= 0) return;
    
    // Sort by lastUpdatedAt and remove oldest
    const sorted = Array.from(this.events.entries())
      .sort(([, a], [, b]) => a.lastUpdatedAt - b.lastUpdatedAt);
    
    for (let i = 0; i < excess && i < sorted.length; i++) {
      const [correlationId, bucket] = sorted[i];
      this.totalEvents -= bucket.rawEvents.length;
      this.events.delete(correlationId);
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.events.clear();
    this.totalEvents = 0;
  }

  /**
   * Check if events match search filters
   * 
   * @param {Array} events - Normalized events to check
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
