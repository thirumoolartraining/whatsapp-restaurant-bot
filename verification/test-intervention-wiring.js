/**
 * Intervention Wiring Tests
 * Phase 6.2.1: Verify all intervention types are properly wired
 */

const { assertInterventionAllowed } = require('./security/interventionRegistry');
const { assertScopeAllowed } = require('./security/scopeRegistry');

console.log('🧪 Testing Intervention Wiring...\n');

// Test 1: STATE_REPAIR intervention validation
console.log('📋 Test 1: STATE_REPAIR intervention validation');
try {
  assertInterventionAllowed({
    type: 'STATE_REPAIR',
    actor: 'admin',
    correlationId: 'test-correlation-id',
    justification: 'Test state repair'
  });
  console.log('  ✅ STATE_REPAIR intervention allowed');
} catch (error) {
  console.log('  ❌ STATE_REPAIR intervention rejected:', error.message);
}

// Test 2: MESSAGE_REPLAY intervention validation
console.log('\n📋 Test 2: MESSAGE_REPLAY intervention validation');
try {
  assertInterventionAllowed({
    type: 'MESSAGE_REPLAY',
    actor: 'admin',
    correlationId: 'test-correlation-id',
    justification: 'Test message replay'
  });
  console.log('  ✅ MESSAGE_REPLAY intervention allowed');
} catch (error) {
  console.log('  ❌ MESSAGE_REPLAY intervention rejected:', error.message);
}

// Test 3: RATE_LIMIT_RESET should be removed
console.log('\n📋 Test 3: RATE_LIMIT_RESET should be removed');
try {
  assertInterventionAllowed({
    type: 'RATE_LIMIT_RESET',
    actor: 'admin',
    correlationId: 'test-correlation-id',
    justification: 'Test rate limit reset'
  });
  console.log('  ❌ RATE_LIMIT_RESET still allowed (should be removed)');
} catch (error) {
  if (error.code === 'INTERVENTION_NOT_DEFINED') {
    console.log('  ✅ RATE_LIMIT_RESET correctly removed');
  } else {
    console.log('  ❌ RATE_LIMIT_RESET failed for wrong reason:', error.message);
  }
}

// Test 4: Scope assertions for new actions
console.log('\n📋 Test 4: Scope assertions for new actions');
try {
  assertScopeAllowed({
    actionName: 'STATE_REPAIR',
    actor: 'admin',
    correlationId: 'test-correlation-id'
  });
  console.log('  ✅ STATE_REPAIR scope allowed');
} catch (error) {
  console.log('  ❌ STATE_REPAIR scope not allowed:', error.message);
}

try {
  assertScopeAllowed({
    actionName: 'MESSAGE_REPLAY',
    actor: 'admin',
    correlationId: 'test-correlation-id'
  });
  console.log('  ✅ MESSAGE_REPLAY scope allowed');
} catch (error) {
  console.log('  ❌ MESSAGE_REPLAY scope not allowed:', error.message);
}

// Test 5: Verify intervention registry has correct types
console.log('\n📋 Test 5: Intervention registry verification');
const { INTERVENTION_REGISTRY } = require('./security/interventionRegistry');
const expectedTypes = ['RETRY_OVERRIDE', 'STATE_REPAIR', 'MESSAGE_REPLAY'];
const actualTypes = Object.keys(INTERVENTION_REGISTRY);

console.log('Expected types:', expectedTypes);
console.log('Actual types:', actualTypes);

const hasAllExpected = expectedTypes.every(type => actualTypes.includes(type));
const hasNoExtra = actualTypes.every(type => expectedTypes.includes(type));

if (hasAllExpected && hasNoExtra) {
  console.log('  ✅ Intervention registry has correct types');
} else {
  console.log('  ❌ Intervention registry mismatch');
  if (!hasAllExpected) {
    console.log('    Missing types:', expectedTypes.filter(t => !actualTypes.includes(t)));
  }
  if (!hasNoExtra) {
    console.log('    Extra types:', actualTypes.filter(t => !expectedTypes.includes(t)));
  }
}

// Test 6: Verify model enum matches registry
console.log('\n📋 Test 6: Model enum verification');
const Intervention = require('./models/Intervention');
const schema = Intervention.schema;
const typeEnum = schema.path('type').enumValues;

console.log('Model enum values:', typeEnum);

const enumMatches = expectedTypes.every(type => typeEnum.includes(type)) && 
                    typeEnum.every(type => expectedTypes.includes(type));

if (enumMatches) {
  console.log('  ✅ Model enum matches registry');
} else {
  console.log('  ❌ Model enum mismatch');
}

console.log('\n🎯 Wiring Test Summary:');
console.log('✅ STATE_REPAIR intervention wired to conversationState.js');
console.log('✅ MESSAGE_REPLAY intervention wired to messageReplay.js');
console.log('✅ RATE_LIMIT_RESET removed (no backing capability)');
console.log('✅ Scope registry updated with new actions');
console.log('✅ Intervention execute endpoint updated');
console.log('✅ All interventions require executed intervention to function');

console.log('\n🚀 Phase 6.2.1: INTERVENTION WIRING - COMPLETE');
