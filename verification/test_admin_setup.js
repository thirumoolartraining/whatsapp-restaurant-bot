const mongoose = require('mongoose');
const User = require('../backend/models/User');
const pushNotification = require('../backend/services/pushNotification');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant_bot';

async function checkAdminSetup() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check admin users
    const admins = await User.find({ role: 'admin' });
    console.log(`\n📊 Found ${admins.length} admin users:`);
    
    for (const admin of admins) {
      console.log(`\n👤 Admin: ${admin.username}`);
      console.log(`   Push Token: ${admin.pushToken ? '✅ Registered' : '❌ Missing'}`);
      console.log(`   Token Updated: ${admin.pushTokenUpdatedAt || 'Never'}`);
      
      if (admin.pushToken) {
        // Test notification to this admin
        console.log('   🧪 Sending test notification...');
        const testResult = await pushNotification.sendTestNotification(admin.pushToken);
        if (testResult.success) {
          console.log('   ✅ Test notification sent successfully');
        } else {
          console.log(`   ❌ Test notification failed: ${testResult.error}`);
        }
      }
    }

    // Check for any push token in any admin
    const adminsWithTokens = admins.filter(admin => admin.pushToken);
    if (adminsWithTokens.length === 0) {
      console.log('\n❌ NO ADMIN PUSH TOKENS FOUND');
      console.log('   Admin app must be opened and notifications granted');
      console.log('   Check mobile app logs for token registration');
    } else {
      console.log(`\n✅ ${adminsWithTokens.length} admin(s) ready for notifications`);
    }

  } catch (error) {
    console.error('❌ Error checking admin setup:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the check
checkAdminSetup();
