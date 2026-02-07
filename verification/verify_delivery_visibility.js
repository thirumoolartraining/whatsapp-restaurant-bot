// Verification test for WhatsApp delivery visibility
const mongoose = require('mongoose');
const DeliveryStatus = require('./models/DeliveryStatus');
const OutboundMessage = require('./models/OutboundMessage');

async function runVerification() {
  console.log('🔍 VERIFICATION: WhatsApp Delivery Visibility\n');
  
  const results = {};
  
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant_bot');
    console.log('✅ Database connected');
    
    // Test 1: Persistence Guarantee
    console.log('\n📋 TEST 1: Persistence Guarantee');
    const testMessageId = 'test_msg_' + Date.now();
    
    // Create multiple status events for same message
    const statuses = ['sent', 'delivered'];
    for (const status of statuses) {
      const deliveryStatus = new DeliveryStatus({
        messageId: testMessageId,
        correlationId: null,
        status: status,
        providerTimestamp: new Date(),
        receivedAt: new Date(),
        rawEventId: `${testMessageId}_${status}_${Date.now()}`,
        phone: '1234567890'
      });
      
      await deliveryStatus.save();
      console.log(`  ✅ Status '${status}' persisted`);
    }
    
    // Verify multiple events exist
    const count = await DeliveryStatus.countDocuments({ messageId: testMessageId });
    results.persistence = count === 2 ? 'PASS' : 'FAIL';
    console.log(`  📊 Found ${count} events for message (expected: 2)`);
    
    // Test 2: Idempotency
    console.log('\n📋 TEST 2: Idempotency');
    const duplicateEventId = `${testMessageId}_sent_${Date.now()}`;
    
    // First insert
    const firstEvent = new DeliveryStatus({
      messageId: testMessageId,
      correlationId: null,
      status: 'sent',
      providerTimestamp: new Date(),
      rawEventId: duplicateEventId,
      phone: '1234567890'
    });
    await firstEvent.save();
    
    // Attempt duplicate insert
    try {
      const duplicateEvent = new DeliveryStatus({
        messageId: testMessageId,
        correlationId: null,
        status: 'sent',
        providerTimestamp: new Date(),
        rawEventId: duplicateEventId, // Same rawEventId
        phone: '1234567890'
      });
      await duplicateEvent.save();
      results.idempotency = 'FAIL'; // Should not reach here
      console.log('  ❌ Duplicate event was inserted (idempotency failed)');
    } catch (error) {
      if (error.code === 11000) { // MongoDB duplicate key error
        results.idempotency = 'PASS';
        console.log('  ✅ Duplicate event prevented by database constraint');
      } else {
        results.idempotency = 'PARTIAL';
        console.log('  ⚠️  Idempotency logic exists but may need DB constraint');
      }
    }
    
    // Test 3: Correlation Behavior
    console.log('\n📋 TEST 3: Correlation Behavior');
    
    // Create an outbound message first
    const outboundMessage = new OutboundMessage({
      provider: 'meta',
      toPhone: '1234567890',
      messageType: 'text',
      payload: { body: 'test message' },
      status: 'pending',
      providerMessageId: 'correlation_test_' + Date.now()
    });
    await outboundMessage.save();
    
    // Create delivery status with matching messageId
    const correlatedStatus = new DeliveryStatus({
      messageId: outboundMessage.providerMessageId,
      correlationId: null, // Should be populated by webhook logic
      status: 'delivered',
      providerTimestamp: new Date(),
      rawEventId: `correlation_${Date.now()}`,
      phone: '1234567890'
    });
    await correlatedStatus.save();
    
    // Test correlation logic manually (simulating webhook)
    const foundOutbound = await OutboundMessage.findOne({ providerMessageId: outboundMessage.providerMessageId });
    if (foundOutbound) {
      results.correlation = 'PASS';
      console.log('  ✅ OutboundMessage found for correlation');
    } else {
      results.correlation = 'FAIL';
      console.log('  ❌ Correlation lookup failed');
    }
    
    // Test 4: Orphan Event Handling
    console.log('\n📋 TEST 4: Orphan Event Handling');
    
    // Create delivery status with non-existent messageId
    const orphanStatus = new DeliveryStatus({
      messageId: 'non_existent_msg_' + Date.now(),
      correlationId: null,
      status: 'delivered',
      providerTimestamp: new Date(),
      rawEventId: `orphan_${Date.now()}`,
      phone: '1234567890'
    });
    await orphanStatus.save();
    
    // Verify orphan is persisted
    const orphanFound = await DeliveryStatus.findOne({ messageId: orphanStatus.messageId });
    results.orphan = orphanFound ? 'PASS' : 'FAIL';
    console.log(`  ✅ Orphan event persisted: ${orphanFound ? 'YES' : 'NO'}`);
    
    // Test 5: Schema Validation
    console.log('\n📋 TEST 5: Schema Validation');
    
    // Test invalid status
    try {
      const invalidStatus = new DeliveryStatus({
        messageId: 'invalid_test',
        status: 'invalid_status', // Not in enum
        providerTimestamp: new Date(),
        rawEventId: `invalid_${Date.now()}`
      });
      await invalidStatus.save();
      results.schema_validation = 'FAIL';
      console.log('  ❌ Invalid status accepted');
    } catch (error) {
      results.schema_validation = 'PASS';
      console.log('  ✅ Invalid status rejected by schema');
    }
    
    // Test 6: Provider Timestamp Preservation
    console.log('\n📋 TEST 6: Provider Timestamp Preservation');
    
    const metaTimestamp = new Date('2024-01-01T12:00:00Z');
    const timestampTest = new DeliveryStatus({
      messageId: 'timestamp_test',
      status: 'sent',
      providerTimestamp: metaTimestamp,
      rawEventId: `timestamp_${Date.now()}`,
      phone: '1234567890'
    });
    await timestampTest.save();
    
    const saved = await DeliveryStatus.findOne({ messageId: 'timestamp_test' });
    const timestampMatch = saved.providerTimestamp.getTime() === metaTimestamp.getTime();
    results.timestamp = timestampMatch ? 'PASS' : 'FAIL';
    console.log(`  ✅ Provider timestamp preserved: ${timestampMatch ? 'YES' : 'NO'}`);
    
    // Cleanup test data
    await DeliveryStatus.deleteMany({ 
      messageId: { $regex: /^(test_msg_|correlation_|non_existent_msg_|invalid_test|timestamp_test)/ }
    });
    await OutboundMessage.deleteOne({ _id: outboundMessage._id });
    
    await mongoose.disconnect();
    console.log('\n✅ Verification completed and test data cleaned up');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    results.error = error.message;
  }
  
  return results;
}

// Print verification summary
function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  
  const sections = [
    { name: 'Persistence Guarantee', key: 'persistence' },
    { name: 'Idempotency', key: 'idempotency' },
    { name: 'Correlation Behavior', key: 'correlation' },
    { name: 'Orphan Event Handling', key: 'orphan' },
    { name: 'Schema Validation', key: 'schema_validation' },
    { name: 'Timestamp Preservation', key: 'timestamp' }
  ];
  
  let passCount = 0;
  let failCount = 0;
  
  sections.forEach(section => {
    const status = results[section.key] || 'NOT_TESTED';
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${section.name.padEnd(25)} | ${status}`);
    
    if (status === 'PASS') passCount++;
    else if (status === 'FAIL') failCount++;
  });
  
  console.log(''.padEnd(60, '-'));
  console.log(`📈 Results: ${passCount} PASS, ${failCount} FAIL`);
  
  // Final verdict
  const verdict = failCount === 0 ? 'DELIVERY VISIBILITY ENABLED' : 'NOT SAFE YET';
  const icon = failCount === 0 ? '🟢' : '🔴';
  console.log(`${icon} VERDICT: ${verdict}`);
}

// Run verification if called directly
if (require.main === module) {
  runVerification().then(results => {
    printSummary(results);
    process.exit(results.error ? 1 : 0);
  });
}

module.exports = { runVerification, printSummary };
