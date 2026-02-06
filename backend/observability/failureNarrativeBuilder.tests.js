/**
 * Phase 5.3: Failure Narrative Engine - Determinism & Purity Tests
 * 
 * This file contains tests to verify the determinism and purity of the failure narrative builder.
 * It ensures that the same timeline always produces the same narrative without side effects.
 */

const { Timeline, TimelineStep, TimelineMetadata } = require('./timelineTypes');
const { buildFailureNarrative } = require('./failureNarrativeBuilder');
const { selectRetryEvents } = require('./failureEventSelector');

/**
 * Test data for deterministic failure narrative building
 */
const createTestTimeline = (correlationId, events) => {
  const steps = events.map((event, index) => new TimelineStep({
    index,
    timestamp: event.timestamp,
    eventName: event.eventName,
    component: event.component,
    phase: event.phase,
    outcome: event.outcome,
    reason: event.reason,
    entityRefs: event.entityRefs,
    rawEventRef: event.rawEventRef
  }));

  const metadata = new TimelineMetadata({
    correlationId,
    totalSteps: steps.length,
    startTime: steps.length > 0 ? steps[0].timestamp : null,
    endTime: steps.length > 0 ? steps[steps.length - 1].timestamp : null,
    gapDetected: false,
    version: '1.0.0'
  });

  return new Timeline({ metadata, steps });
};

/**
 * Test Case 1: No Failure (Success Path)
 */
const testNoFailure = () => {
  const timeline = createTestTimeline('test-1', [
    {
      timestamp: '2023-01-01T10:00:00Z',
      eventName: 'webhook_received',
      component: 'ingress',
      phase: 'ingress',
      outcome: 'success'
    },
    {
      timestamp: '2023-01-01T10:00:01Z',
      eventName: 'message_sent',
      component: 'worker',
      phase: 'worker',
      outcome: 'success'
    }
  ]);

  const narrative1 = buildFailureNarrative(timeline);
  const narrative2 = buildFailureNarrative(timeline);

  // Verify determinism
  if (JSON.stringify(narrative1.toObject()) !== JSON.stringify(narrative2.toObject())) {
    throw new Error('Determinism test failed: same timeline produced different narratives');
  }

  // Verify success narrative
  if (narrative1.failed !== false) {
    throw new Error('Success narrative test failed: expected failed=false');
  }

  console.log('✓ Test 1 passed: No failure narrative is deterministic');
};

/**
 * Test Case 2: Single Failure with Retry
 */
const testSingleFailureWithRetry = () => {
  const timeline = createTestTimeline('test-2', [
    {
      timestamp: '2023-01-01T10:00:00Z',
      eventName: 'webhook_received',
      component: 'ingress',
      phase: 'ingress',
      outcome: 'success'
    },
    {
      timestamp: '2023-01-01T10:00:01Z',
      eventName: 'message_send_failed',
      component: 'worker',
      phase: 'worker',
      outcome: 'failed',
      reason: { errorCode: 'PROVIDER_ERROR', errorCategory: 'provider' },
      entityRefs: { provider: 'twilio' }
    },
    {
      timestamp: '2023-01-01T10:00:02Z',
      eventName: 'retry_scheduled',
      component: 'retry',
      phase: 'retry',
      outcome: 'retried',
      reason: { retryCount: 1, maxRetries: 3 }
    }
  ]);

  const narrative1 = buildFailureNarrative(timeline);
  const narrative2 = buildFailureNarrative(timeline);

  // Verify determinism
  if (JSON.stringify(narrative1.toObject()) !== JSON.stringify(narrative2.toObject())) {
    throw new Error('Determinism test failed: same timeline produced different narratives');
  }

  // Verify failure narrative
  if (narrative1.failed !== true) {
    throw new Error('Failure narrative test failed: expected failed=true');
  }

  if (narrative1.errorCategory !== 'provider') {
    throw new Error('Error category test failed: expected provider');
  }

  if (narrative1.finality !== 'retryable') {
    throw new Error('Finality test failed: expected retryable');
  }

  if (narrative1.attempts !== 1) {
    throw new Error('Attempts test failed: expected 1');
  }

  console.log('✓ Test 2 passed: Single failure with retry is deterministic');
};

/**
 * Test Case 3: Terminal Failure
 */
const testTerminalFailure = () => {
  const timeline = createTestTimeline('test-3', [
    {
      timestamp: '2023-01-01T10:00:00Z',
      eventName: 'webhook_received',
      component: 'ingress',
      phase: 'ingress',
      outcome: 'success'
    },
    {
      timestamp: '2023-01-01T10:00:01Z',
      eventName: 'message_send_failed',
      component: 'worker',
      phase: 'worker',
      outcome: 'failed',
      reason: { errorCode: 'PROVIDER_ERROR', errorCategory: 'provider' }
    },
    {
      timestamp: '2023-01-01T10:00:02Z',
      eventName: 'retry_scheduled',
      component: 'retry',
      phase: 'retry',
      outcome: 'retried',
      reason: { retryCount: 1, maxRetries: 3 }
    },
    {
      timestamp: '2023-01-01T10:00:03Z',
      eventName: 'retry_exhausted',
      component: 'retry',
      phase: 'retry',
      outcome: 'failed',
      reason: { retryCount: 3, maxRetries: 3 }
    },
    {
      timestamp: '2023-01-01T10:00:04Z',
      eventName: 'job_deadlettered',
      component: 'worker',
      phase: 'terminal',
      outcome: 'deadlettered',
      reason: { errorCategory: 'deadletter' }
    }
  ]);

  const narrative1 = buildFailureNarrative(timeline);
  const narrative2 = buildFailureNarrative(timeline);

  // Verify determinism
  if (JSON.stringify(narrative1.toObject()) !== JSON.stringify(narrative2.toObject())) {
    throw new Error('Determinism test failed: same timeline produced different narratives');
  }

  // Verify terminal failure narrative
  if (narrative1.failed !== true) {
    throw new Error('Terminal failure test failed: expected failed=true');
  }

  if (narrative1.finality !== 'terminal') {
    throw new Error('Finality test failed: expected terminal');
  }

  if (narrative1.eventName !== 'job_deadlettered') {
    throw new Error('Event name test failed: expected job_deadlettered');
  }

  if (narrative1.attempts !== 3) {
    // Removed debug line
    // Removed debug line
    throw new Error('Attempts test failed: expected 3');
  }

  console.log('✓ Test 3 passed: Terminal failure narrative is deterministic');
};

/**
 * Test Case 4: Multiple Failures (Last Terminal Wins)
 */
const testMultipleFailures = () => {
  const timeline = createTestTimeline('test-4', [
    {
      timestamp: '2023-01-01T10:00:00Z',
      eventName: 'webhook_received',
      component: 'ingress',
      phase: 'ingress',
      outcome: 'success'
    },
    {
      timestamp: '2023-01-01T10:00:01Z',
      eventName: 'validation_failed',
      component: 'router',
      phase: 'routing',
      outcome: 'failed',
      reason: { errorCode: 'INVALID_INPUT', errorCategory: 'validation' }
    },
    {
      timestamp: '2023-01-01T10:00:02Z',
      eventName: 'message_send_failed',
      component: 'worker',
      phase: 'worker',
      outcome: 'failed',
      reason: { errorCode: 'PROVIDER_ERROR', errorCategory: 'provider' }
    },
    {
      timestamp: '2023-01-01T10:00:03Z',
      eventName: 'job_deadlettered',
      component: 'worker',
      phase: 'terminal',
      outcome: 'deadlettered',
      reason: { errorCategory: 'deadletter' }
    }
  ]);

  const narrative1 = buildFailureNarrative(timeline);
  const narrative2 = buildFailureNarrative(timeline);

  // Verify determinism
  if (JSON.stringify(narrative1.toObject()) !== JSON.stringify(narrative2.toObject())) {
    throw new Error('Determinism test failed: same timeline produced different narratives');
  }

  // Verify last terminal failure wins
  if (narrative1.eventName !== 'job_deadlettered') {
    throw new Error('Multiple failures test failed: expected last terminal failure to win');
  }

  if (narrative1.errorCategory !== 'deadletter') {
    throw new Error('Multiple failures test failed: expected deadletter error category');
  }

  console.log('✓ Test 4 passed: Multiple failures handled correctly');
};

/**
 * Test Case 5: Purity Check (No Side Effects)
 */
const testPurity = () => {
  const timeline = createTestTimeline('test-5', [
    {
      timestamp: '2023-01-01T10:00:00Z',
      eventName: 'message_send_failed',
      component: 'worker',
      phase: 'worker',
      outcome: 'failed',
      reason: { errorCode: 'PROVIDER_ERROR', errorCategory: 'provider' }
    }
  ]);

  // Store original timeline
  const originalTimeline = JSON.stringify(timeline.toObject());

  // Build narrative multiple times
  buildFailureNarrative(timeline);
  buildFailureNarrative(timeline);
  buildFailureNarrative(timeline);

  // Check timeline hasn't changed
  const finalTimeline = JSON.stringify(timeline.toObject());
  
  if (originalTimeline !== finalTimeline) {
    throw new Error('Purity test failed: timeline was mutated during narrative building');
  }

  console.log('✓ Test 5 passed: Narrative builder is pure (no side effects)');
};

/**
 * Run all determinism and purity tests
 */
const runDeterminismTests = () => {
  console.log('Running Phase 5.3 Determinism & Purity Tests...\n');

  try {
    testNoFailure();
    testSingleFailureWithRetry();
    testTerminalFailure();
    testMultipleFailures();
    testPurity();

    console.log('\n✅ All Phase 5.3 determinism and purity tests passed!');
    console.log('✅ Failure narrative builder is deterministic and pure');
    console.log('✅ Same timeline always produces same narrative');
    console.log('✅ No side effects on input timeline');
    
    return true;
  } catch (error) {
    console.error('\n❌ Phase 5.3 test failed:', error.message);
    return false;
  }
};

// Export for use in other test files or direct execution
module.exports = {
  runDeterminismTests,
  createTestTimeline,
  testNoFailure,
  testSingleFailureWithRetry,
  testTerminalFailure,
  testMultipleFailures,
  testPurity
};

// Run tests if this file is executed directly
if (require.main === module) {
  runDeterminismTests();
}
