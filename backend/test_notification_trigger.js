const mongoose = require('mongoose');
const User = require('./models/User');
const pushNotification = require('./services/pushNotification');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant_bot';

async function triggerTestNotification() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find admin users with push tokens
    const admins = await User.find({ role: 'admin', pushToken: { $ne: null } });
    
    if (admins.length === 0) {
      console.log('❌ No admin users with push tokens found');
      console.log('   Admin app must register push token first');
      return;
    }

    console.log(`📊 Found ${admins.length} admin(s) with push tokens`);

    // Create test order details
    const testOrderDetails = {
      orderId: 'TEST_' + Date.now(),
      totalAmount: 299,
      customerName: 'Test Customer',
      items: [{ name: 'Test Item', quantity: 1 }]
    };

    console.log(`\n🧪 Triggering test notification for Order: ${testOrderDetails.orderId}`);

    // Send notification to each admin
    for (const admin of admins) {
      console.log(`\n📱 Sending to admin: ${admin.username}`);
      console.log(`   Push Token: ${admin.pushToken.substring(0, 20)}...`);
      
      const result = await pushNotification.sendAdminNewOrderNotification(
        admin.pushToken, 
        testOrderDetails
      );

      if (result && result.length > 0) {
        const ticket = result[0];
        if (ticket.status === 'ok') {
          console.log('   ✅ Notification sent successfully');
          console.log(`   🎫 Ticket ID: ${ticket.id}`);
        } else if (ticket.status === 'error') {
          console.log(`   ❌ Notification failed: ${ticket.message}`);
          console.log(`   📋 Error details:`, ticket.details);
        }
      } else {
        console.log('   ❌ Failed to send notification');
      }
    }

    console.log('\n🔍 Check your mobile devices for the test notification!');
    console.log('   Title: "🎉 New Order Received!"');
    console.log(`   Body: Order #${testOrderDetails.orderId} - ₹299`);
    console.log('   This confirms the notification system is working.');

  } catch (error) {
    console.error('❌ Error triggering test notification:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the test
triggerTestNotification();
