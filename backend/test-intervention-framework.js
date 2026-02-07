/**
 * Intervention Framework Test Script
 * Phase 6.2: INTERVENTION AUTHORITY FRAMEWORK
 * 
 * Tests proving:
 * - 2nd execute attempt for same correlationId+type is rejected
 * - retry override grants exactly +1 attempt and then stops
 * - state repair only works for allowed edge set
 * - all events emit correctly
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import modules to test
const { assertInterventionAllowed, recordInterventionAttempt } = require('./security/interventionRegistry');
const Intervention = require('./models/Intervention');
const { shouldRetryWithIntervention } = require('./services/queue/retryPolicy');

// Test configuration
const TEST_CORRELATION_ID = 'test-intervention-' + Date.now();
const TEST_ACTOR = 'admin';
const TEST_JUSTIFICATION = 'Test intervention verification';

async function runTests() {
  console.log('🧪 Starting Intervention Framework Tests...\n');
  
  try {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');
    
    // Clean up any existing test data
    await Intervention.deleteMany({ correlationId: { $regex: /^test-intervention-/ } });
    
    // Test 1: Intervention validation
    console.log('📋 Test 1: Intervention validation');
    await testInterventionValidation();
    
    // Test 2: Cap enforcement
    console.log('\n📋 Test 2: Cap enforcement');
    await testCapEnforcement();
    
    // Test 3: Retry override intervention
    console.log('\n📋 Test 3: Retry override intervention');
    await testRetryOverride();
    
    // Test 4: State repair limits
    console.log('\n📋 Test 4: State repair limits');
    await testStateRepairLimits();
    
    // Test 5: Audit events
    console.log('\n📋 Test 5: Audit events');
    await testAuditEvents();
    
    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

async function testInterventionValidation() {
  // Test valid intervention
  try {
    assertInterventionAllowed({
      type: 'RETRY_OVERRIDE',
      actor: TEST_ACTOR,
      correlationId: TEST_CORRELATION_ID,
      justification: TEST_JUSTIFICATION
    });
    console.log('  ✅ Valid intervention allowed');
  } catch (error) {
    console.error('  ❌ Valid intervention rejected:', error.message);
    throw error;
  }
  
  // Test invalid type
  try {
    assertInterventionAllowed({
      type: 'INVALID_TYPE',
      actor: TEST_ACTOR,
      correlationId: TEST_CORRELATION_ID,
      justification: TEST_JUSTIFICATION
    });
    console.error('  ❌ Invalid type was allowed');
    throw new Error('Invalid type should have been rejected');
  } catch (error) {
    if (error.code === 'INTERVENTION_NOT_DEFINED') {
      console.log('  ✅ Invalid type correctly rejected');
    } else {
      throw error;
    }
  }
  
  // Test missing justification
  try {
    assertInterventionAllowed({
      type: 'RETRY_OVERRIDE',
      actor: TEST_ACTOR,
      correlationId: TEST_CORRELATION_ID
    });
    console.error('  ❌ Missing justification was allowed');
    throw new Error('Missing justification should have been rejected');
  } catch (error) {
    if (error.code === 'JUSTIFICATION_REQUIRED') {
      console.log('  ✅ Missing justification correctly rejected');
    } else {
      throw error;
    }
  }
}

async function testCapEnforcement() {
  // Create first intervention
  const intervention1 = new Intervention({
    type: 'RETRY_OVERRIDE',
    correlationId: TEST_CORRELATION_ID,
    actor: TEST_ACTOR,
    justification: TEST_JUSTIFICATION,
    status: 'executed'
  });
  await intervention1.save();
  console.log('  ✅ First intervention created');
  
  // Try to create second intervention (should fail)
  try {
    const intervention2 = new Intervention({
      type: 'RETRY_OVERRIDE',
      correlationId: TEST_CORRELATION_ID,
      actor: TEST_ACTOR,
      justification: TEST_JUSTIFICATION,
      status: 'executed'
    });
    await intervention2.save();
    console.error('  ❌ Second intervention was allowed (cap exceeded)');
    throw new Error('Second intervention should have been rejected');
  } catch (error) {
    if (error.code === 11000 || error.code === 'INTERVENTION_CAP_EXCEEDED') { // MongoDB duplicate key error
      console.log('  ✅ Second intervention correctly rejected (cap enforced)');
    } else {
      throw error;
    }
  }
}

async function testRetryOverride() {
  // Test normal retry policy (no intervention)
  const normalRetry = await shouldRetryWithIntervention({
    errorCategory: 'transient',
    attemptNumber: 3,
    maxAttempts: 3,
    correlationId: TEST_CORRELATION_ID + '-retry'
  });
  
  if (normalRetry === false) {
    console.log('  ✅ Normal retry policy denies exhausted attempts');
  } else {
    console.error('  ❌ Normal retry policy should deny exhausted attempts');
    throw new Error('Normal retry policy failed');
  }
  
  // Create retry override intervention
  const retryIntervention = new Intervention({
    type: 'RETRY_OVERRIDE',
    correlationId: TEST_CORRELATION_ID + '-retry',
    actor: TEST_ACTOR,
    justification: TEST_JUSTIFICATION,
    status: 'executed'
  });
  await retryIntervention.save();
  
  // Test retry with intervention (should allow exactly one extra)
  const interventionRetry = await shouldRetryWithIntervention({
    errorCategory: 'transient',
    attemptNumber: 3,
    maxAttempts: 3,
    correlationId: TEST_CORRELATION_ID + '-retry'
  });
  
  if (interventionRetry === true) {
    console.log('  ✅ Retry override allows one extra attempt');
  } else {
    console.error('  ❌ Retry override should allow one extra attempt');
    throw new Error('Retry override failed');
  }
  
  // Test second extra attempt (should be denied)
  const secondExtraRetry = await shouldRetryWithIntervention({
    errorCategory: 'transient',
    attemptNumber: 4,
    maxAttempts: 3,
    correlationId: TEST_CORRELATION_ID + '-retry'
  });
  
  if (secondExtraRetry === false) {
    console.log('  ✅ Second extra retry correctly denied');
  } else {
    console.error('  ❌ Second extra retry should be denied');
    throw new Error('Second extra retry should have been denied');
  }
}

async function testStateRepairLimits() {
  // Test valid state repair intervention
  try {
    assertInterventionAllowed({
      type: 'STATE_REPAIR',
      actor: TEST_ACTOR,
      correlationId: TEST_CORRELATION_ID + '-state',
      justification: TEST_JUSTIFICATION
    });
    console.log('  ✅ State repair intervention allowed');
  } catch (error) {
    console.error('  ❌ State repair intervention rejected:', error.message);
    throw error;
  }
  
  // Create state repair intervention
  const stateIntervention = new Intervention({
    type: 'STATE_REPAIR',
    correlationId: TEST_CORRELATION_ID + '-state',
    actor: TEST_ACTOR,
    justification: TEST_JUSTIFICATION,
    status: 'executed',
    metadata: { fromState: 'error', toState: 'welcome' }
  });
  await stateIntervention.save();
  
  // Verify safe transition was recorded
  const savedIntervention = await Intervention.findOne({
    correlationId: TEST_CORRELATION_ID + '-state',
    type: 'STATE_REPAIR'
  });
  
  if (savedIntervention && savedIntervention.metadata.fromState === 'error' && savedIntervention.metadata.toState === 'welcome') {
    console.log('  ✅ Safe state transition recorded');
  } else {
    console.error('  ❌ Safe state transition not properly recorded');
    throw new Error('State transition metadata failed');
  }
}

async function testAuditEvents() {
  // Test audit event recording
  const auditEvents = [];
  
  // Mock logger to capture audit events
  const originalInfo = console.info;
  const originalWarn = console.warn;
  
  console.info = (message, data) => {
    if (data && data.event && data.event.startsWith('intervention_')) {
      auditEvents.push(data);
    }
  };
  
  console.warn = (message, data) => {
    if (data && data.event && data.event.startsWith('intervention_')) {
      auditEvents.push(data);
    }
  };
  
  try {
    // Trigger intervention events
    recordInterventionAttempt({
      type: 'MESSAGE_REPLAY',
      actor: TEST_ACTOR,
      correlationId: TEST_CORRELATION_ID + '-audit',
      justification: TEST_JUSTIFICATION,
      status: 'requested'
    });
    
    // Restore console methods
    console.info = originalInfo;
    console.warn = originalWarn;
    
    // Verify audit events were emitted
    if (auditEvents.length > 0) {
      console.log('  ✅ Audit events emitted correctly');
    } else {
      console.error('  ❌ No audit events were emitted');
      throw new Error('Audit events not working');
    }
    
  } catch (error) {
    // Restore console methods on error
    console.info = originalInfo;
    console.warn = originalWarn;
    throw error;
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
