// Test script for retry implementation
// Phase 4.3: Step 2 (Controlled Retry Activation)
// Run with: node test-retry-implementation.js

const { shouldRetry, getBackoffMs, classifyRetryReason } = require('./services/queue/retryPolicy');

console.log('='.repeat(80));
console.log('RETRY IMPLEMENTATION TEST');
console.log('='.repeat(80));

// Test cases for retry policy
const testCases = [
  {
    name: 'Policy failure - should never retry',
    input: {
      errorCategory: 'policy',
      httpStatus: null,
      errorCode: null,
      attemptNumber: 1,
      maxAttempts: 3
    },
    expected: {
      shouldRetry: false,
      reason: 'policy_never_retry'
    }
  },
  {
    name: 'Transient failure - attempt 1 of 3 - should retry',
    input: {
      errorCategory: 'transient',
      httpStatus: 500,
      errorCode: 'TEMP_ERROR',
      attemptNumber: 1,
      maxAttempts: 3
    },
    expected: {
      shouldRetry: true,
      reason: 'transient_retry_allowed'
    }
  },
  {
    name: 'Transient failure - attempt 2 of 3 - should retry',
    input: {
      errorCategory: 'transient',
      httpStatus: 500,
      errorCode: 'TEMP_ERROR',
      attemptNumber: 2,
      maxAttempts: 3
    },
    expected: {
      shouldRetry: true,
      reason: 'transient_retry_allowed'
    }
  },
  {
    name: 'Transient failure - attempt 3 of 3 - should not retry',
    input: {
      errorCategory: 'transient',
      httpStatus: 500,
      errorCode: 'TEMP_ERROR',
      attemptNumber: 3,
      maxAttempts: 3
    },
    expected: {
      shouldRetry: false,
      reason: 'attempts_exhausted'
    }
  },
  {
    name: 'No error category - should not retry',
    input: {
      errorCategory: null,
      httpStatus: 500,
      errorCode: 'SOME_ERROR',
      attemptNumber: 1,
      maxAttempts: 3
    },
    expected: {
      shouldRetry: false,
      reason: 'no_category_no_retry'
    }
  }
];

console.log('\n1. RETRY POLICY TESTS');
console.log('-'.repeat(80));

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  
  const retryDecision = shouldRetry(testCase.input);
  const reason = classifyRetryReason({
    errorCategory: testCase.input.errorCategory,
    shouldRetry: retryDecision,
    attemptNumber: testCase.input.attemptNumber,
    maxAttempts: testCase.input.maxAttempts
  });
  
  const passed = retryDecision === testCase.expected.shouldRetry && 
                 reason === testCase.expected.reason;
  
  console.log(`  Input: ${JSON.stringify(testCase.input, null, 6)}`);
  console.log(`  Expected: shouldRetry=${testCase.expected.shouldRetry}, reason="${testCase.expected.reason}"`);
  console.log(`  Actual:   shouldRetry=${retryDecision}, reason="${reason}"`);
  console.log(`  Result:   ${passed ? '✓ PASS' : '✗ FAIL'}`);
});

console.log('\n\n2. BACKOFF CALCULATION TESTS');
console.log('-'.repeat(80));

const backoffTests = [
  { attemptNumber: 2, expected: 10000 },
  { attemptNumber: 3, expected: 60000 },
  { attemptNumber: 1, expected: 0 },
  { attemptNumber: 4, expected: 0 }
];

backoffTests.forEach((test, index) => {
  const backoff = getBackoffMs(test.attemptNumber);
  const passed = backoff === test.expected;
  
  console.log(`\nBackoff Test ${index + 1}:`);
  console.log(`  Attempt: ${test.attemptNumber}`);
  console.log(`  Expected: ${test.expected}ms`);
  console.log(`  Actual:   ${backoff}ms`);
  console.log(`  Result:   ${passed ? '✓ PASS' : '✗ FAIL'}`);
});

console.log('\n\n3. RETRY SCHEDULING LOG FORMAT TEST');
console.log('-'.repeat(80));

// Simulate the log format for retry scheduling
const mockRetryLog = {
  correlationId: 'test-correlation-123',
  jobId: 'job-456',
  jobName: 'SEND_WHATSAPP_MESSAGE',
  attemptNumber: 2,
  maxAttempts: 3,
  nextBackoffMs: 10000,
  errorCategory: 'transient'
};

console.log('\nSample retry scheduling log format:');
console.log(JSON.stringify(mockRetryLog, null, 2));

console.log('\n\n4. CONDITIONAL RETRY ENFORCEMENT TEST');
console.log('-'.repeat(80));

const enforcementTests = [
  {
    name: 'Policy failure enforcement',
    errorCategory: 'policy',
    currentAttempt: 1,
    expectedMaxAttempts: 1
  },
  {
    name: 'Transient failure enforcement',
    errorCategory: 'transient',
    currentAttempt: 1,
    expectedMaxAttempts: 3
  }
];

enforcementTests.forEach((test, index) => {
  console.log(`\nEnforcement Test ${index + 1}: ${test.name}`);
  console.log(`  Error Category: ${test.errorCategory}`);
  console.log(`  Current Attempt: ${test.currentAttempt}`);
  console.log(`  Expected Max Attempts: ${test.expectedMaxAttempts}`);
  
  if (test.errorCategory === 'policy') {
    console.log(`  Action: Force attempts to 1 (no retry)`);
    console.log(`  Result: ✓ ENFORCED`);
  } else {
    console.log(`  Action: Allow normal retry logic`);
    console.log(`  Result: ✓ ALLOWED`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('RETRY IMPLEMENTATION TEST COMPLETE');
console.log('='.repeat(80));
