// Simple test to verify delivery status processing
const mongoose = require('mongoose');
const DeliveryStatus = require('./models/DeliveryStatus');
const OutboundMessage = require('./models/OutboundMessage');

async function testDeliveryStatus() {
  try {
    // Connect to MongoDB (using existing connection string from .env)
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant_bot');
    
    console.log('✅ Connected to MongoDB');
    
    // Test creating a delivery status
    const testStatus = new DeliveryStatus({
      messageId: 'test_msg_123',
      correlationId: null,
      status: 'delivered',
      providerTimestamp: new Date(),
      receivedAt: new Date(),
      rawEventId: 'test_msg_123_delivered_' + Date.now(),
      phone: '1234567890'
    });
    
    await testStatus.save();
    console.log('✅ Delivery status created:', testStatus._id);
    
    // Test finding the status
    const found = await DeliveryStatus.findOne({ messageId: 'test_msg_123' });
    console.log('✅ Delivery status found:', found.status);
    
    // Clean up
    await DeliveryStatus.deleteOne({ _id: testStatus._id });
    console.log('✅ Test data cleaned up');
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testDeliveryStatus();
}

module.exports = testDeliveryStatus;
