/**
 * Phase 5.2: Timeline Reconstruction Engine - Determinism & Purity Tests
 * 
 * This file contains read-only tests to verify timeline builder determinism and purity.
 * These tests ensure the timeline builder is pure and deterministic.
 */

const { buildTimeline, EVENT_PHASE_MAPPING, mapEventToPhase, deriveOutcome } = require('./timelineBuilder');
const { CanonicalEvent } = require('./eventEnvelope');
const { PHASES, OUTCOMES } = require('./timelineTypes');

/**
 * Test Data Factory
 * 
 * Creates test events for verification.
 */
function createTestEvent(overrides = {}) {
  const baseEvent = {
    eventName: 'test_event',
    component: 'test_component',
    timestamp: '2024-01-01T00:00:00.000Z',
    correlationId: 'test-correlation-123',
    level: 'info'
  };
  
  return new CanonicalEvent({ ...baseEvent, ...overrides });
}

/**
 * Test Suite: Event Phase Mapping Determinism
 */
function testEventPhaseMapping() {
  console.log('Testing Event Phase Mapping Determinism...');
  
  // Test explicit mappings
  const testCases = [
    { eventName: 'webhook_received', expectedPhase: PHASES.INGRESS },
    { eventName: 'domain_handler_entered', expectedPhase: PHASES.ROUTING },
    { eventName: 'customer_sync_start', expectedPhase: PHASES.DOMAIN },
    { eventName: 'worker_started', expectedPhase: PHASES.WORKER },
    { eventName: 'retry_scheduled', expectedPhase: PHASES.RETRY },
    { eventName: 'throttle_applied', expectedPhase: PHASES.THROTTLE },
    { eventName: 'job_deadlettered', expectedPhase: PHASES.TERMINAL },
    { eventName: 'unknown_event', expectedPhase: PHASES.UNKNOWN }
  ];
  
  testCases.forEach(({ eventName, expectedPhase }) => {
    const actualPhase = mapEventToPhase(eventName);
    if (actualPhase !== expectedPhase) {
      throw new Error(`Phase mapping failed for ${eventName}: expected ${expectedPhase}, got ${actualPhase}`);
    }
  });
  
  console.log('✓ Event phase mapping is deterministic');
}

/**
 * Test Suite: Outcome Derivation Determinism
 */
function testOutcomeDerivation() {
  console.log('Testing Outcome Derivation Determinism...');
  
  const testCases = [
    // Level-based outcomes
    {
      event: createTestEvent({ level: 'error' }),
      expectedOutcome: OUTCOMES.FAILED
    },
    {
      event: createTestEvent({ level: 'info' }),
      expectedOutcome: OUTCOMES.SUCCESS
    },
    // Payload-based outcomes
    {
      event: createTestEvent({ 
        level: 'info',
        payload: { success: true }
      }),
      expectedOutcome: OUTCOMES.SUCCESS
    },
    {
      event: createTestEvent({ 
        level: 'warn',
        payload: { throttled: true }
      }),
      expectedOutcome: OUTCOMES.THROTTLED
    },
    {
      event: createTestEvent({ 
        level: 'error',
        payload: { deadlettered: true }
      }),
      expectedOutcome: OUTCOMES.DEADLETTERED
    },
    {
      event: createTestEvent({ 
        level: 'info',
        payload: { retried: true }
      }),
      expectedOutcome: OUTCOMES.RETRIED
    }
  ];
  
  testCases.forEach(({ event, expectedOutcome }) => {
    const actualOutcome = deriveOutcome(event);
    if (actualOutcome !== expectedOutcome) {
      throw new Error(`Outcome derivation failed: expected ${expectedOutcome}, got ${actualOutcome}`);
    }
  });
  
  console.log('✓ Outcome derivation is deterministic');
}

/**
 * Test Suite: Timeline Builder Purity
 */
function testTimelineBuilderPurity() {
  console.log('Testing Timeline Builder Purity...');
  
  // Create test events
  const events = [
    createTestEvent({
      eventName: 'webhook_received',
      timestamp: '2024-01-01T00:00:01.000Z',
      correlationId: 'purity-test-123'
    }),
    createTestEvent({
      eventName: 'domain_handler_entered',
      timestamp: '2024-01-01T00:00:02.000Z',
      correlationId: 'purity-test-123'
    }),
    createTestEvent({
      eventName: 'worker_started',
      timestamp: '2024-01-01T00:00:03.000Z',
      correlationId: 'purity-test-123'
    })
  ];
  
  // Build timeline multiple times with same input
  const timeline1 = buildTimeline('purity-test-123', { events });
  const timeline2 = buildTimeline('purity-test-123', { events });
  const timeline3 = buildTimeline('purity-test-123', { events });
  
  // Verify outputs are identical
  const json1 = JSON.stringify(timeline1.toObject());
  const json2 = JSON.stringify(timeline2.toObject());
  const json3 = JSON.stringify(timeline3.toObject());
  
  if (json1 !== json2 || json2 !== json3) {
    throw new Error('Timeline builder is not pure - same input produced different outputs');
  }
  
  // Verify input events are not mutated
  const originalEventCount = events.length;
  const originalFirstEventName = events[0].eventName;
  
  buildTimeline('purity-test-123', { events });
  
  if (events.length !== originalEventCount) {
    throw new Error('Timeline builder mutated input events array length');
  }
  
  if (events[0].eventName !== originalFirstEventName) {
    throw new Error('Timeline builder mutated input event properties');
  }
  
  console.log('✓ Timeline builder is pure');
}

/**
 * Test Suite: Deterministic Sorting
 */
function testDeterministicSorting() {
  console.log('Testing Deterministic Sorting...');
  
  // Create events with same timestamp (collision case)
  const events = [
    createTestEvent({
      eventName: 'worker_started',
      component: 'worker_B',
      timestamp: '2024-01-01T00:00:01.000Z',
      correlationId: 'sort-test-123'
    }),
    createTestEvent({
      eventName: 'webhook_received',
      component: 'ingress',
      timestamp: '2024-01-01T00:00:01.000Z',
      correlationId: 'sort-test-123'
    }),
    createTestEvent({
      eventName: 'domain_handler_entered',
      component: 'router_A',
      timestamp: '2024-01-01T00:00:01.000Z',
      correlationId: 'sort-test-123'
    })
  ];
  
  const timeline = buildTimeline('sort-test-123', { events });
  const steps = timeline.steps;
  
  // Verify stable order: eventName then component
  const expectedOrder = [
    'domain_handler_entered', // D comes before W
    'webhook_received',       // W comes before worker_started
    'worker_started'
  ];
  
  const actualOrder = steps.map(step => step.eventName);
  
  if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
    throw new Error(`Deterministic sorting failed: expected ${JSON.stringify(expectedOrder)}, got ${JSON.stringify(actualOrder)}`);
  }
  
  console.log('✓ Deterministic sorting works correctly');
}

/**
 * Test Suite: Gap Detection
 */
function testGapDetection() {
  console.log('Testing Gap Detection...');
  
  // Test empty timeline
  const emptyTimeline = buildTimeline('empty-test', { events: [] });
  if (!emptyTimeline.metadata.gapDetected || emptyTimeline.metadata.gapReason !== 'empty_timeline') {
    throw new Error('Gap detection failed for empty timeline');
  }
  
  // Test large timestamp jump
  const jumpEvents = [
    createTestEvent({
      eventName: 'webhook_received',
      timestamp: '2024-01-01T00:00:01.000Z',
      correlationId: 'jump-test-123'
    }),
    createTestEvent({
      eventName: 'worker_completed',
      timestamp: '2024-01-01T00:10:00.000Z', // 10 minute jump
      correlationId: 'jump-test-123'
    })
  ];
  
  const jumpTimeline = buildTimeline('jump-test-123', { events: jumpEvents });
  if (!jumpTimeline.metadata.gapDetected || jumpTimeline.metadata.gapReason !== 'large_timestamp_jump') {
    throw new Error('Gap detection failed for large timestamp jump');
  }
  
  // Test missing expected phases
  const incompleteEvents = [
    createTestEvent({
      eventName: 'webhook_received',
      timestamp: '2024-01-01T00:00:01.000Z',
      correlationId: 'incomplete-test-123'
    }),
    createTestEvent({
      eventName: 'worker_started',
      timestamp: '2024-01-01T00:00:02.000Z',
      correlationId: 'incomplete-test-123'
    })
  ];
  
  const incompleteTimeline = buildTimeline('incomplete-test-123', { events: incompleteEvents });
  if (!incompleteTimeline.metadata.gapDetected || incompleteTimeline.metadata.missingPhases.length === 0) {
    throw new Error('Gap detection failed for missing expected phases');
  }
  
  console.log('✓ Gap detection works correctly');
}

/**
 * Test Suite: No Side Effects
 */
function testNoSideEffects() {
  console.log('Testing No Side Effects...');
  
  // Mock console to ensure no logging
  const originalConsole = global.console;
  let consoleCalls = [];
  
  global.console = {
    log: (...args) => consoleCalls.push(['log', ...args]),
    warn: (...args) => consoleCalls.push(['warn', ...args]),
    error: (...args) => consoleCalls.push(['error', ...args]),
    info: (...args) => consoleCalls.push(['info', ...args])
  };
  
  try {
    const events = [
      createTestEvent({
        eventName: 'webhook_received',
        timestamp: '2024-01-01T00:00:01.000Z',
        correlationId: 'side-effect-test-123'
      })
    ];
    
    buildTimeline('side-effect-test-123', { events });
    
    if (consoleCalls.length > 0) {
      throw new Error(`Timeline builder produced console output: ${JSON.stringify(consoleCalls)}`);
    }
    
    console.log('✓ No side effects detected');
  } finally {
    global.console = originalConsole;
  }
}

/**
 * Run all determinism and purity tests
 */
function runDeterminismTests() {
  console.log('=== Phase 5.2 Determinism & Purity Tests ===');
  
  try {
    testEventPhaseMapping();
    testOutcomeDerivation();
    testTimelineBuilderPurity();
    testDeterministicSorting();
    testGapDetection();
    testNoSideEffects();
    
    console.log('\n✅ All determinism and purity tests passed!');
    return true;
  } catch (error) {
    console.error('\n❌ Determinism or purity test failed:', error.message);
    return false;
  }
}

module.exports = {
  // Test functions
  runDeterminismTests,
  testEventPhaseMapping,
  testOutcomeDerivation,
  testTimelineBuilderPurity,
  testDeterministicSorting,
  testGapDetection,
  testNoSideEffects,
  
  // Test utilities
  createTestEvent
};
