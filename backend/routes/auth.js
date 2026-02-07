const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Logger = require('../services/logger');
const router = express.Router();

const logger = new Logger('auth');

// Public test endpoint - send test notification to any push token (for debugging)
// Only available in non-production environments
if (process.env.NODE_ENV !== 'production') {
  router.post('/test-push', async (req, res) => {
  try {
    const { pushToken } = req.body;
    
    if (!pushToken) {
      return res.status(400).json({ error: 'pushToken is required in request body' });
    }
    
    const pushNotification = require('../services/pushNotification');
    
    const result = await pushNotification.sendTestNotification(pushToken);
    res.json({ message: 'Test notification sent', result });
  } catch (error) {
    logger.error('test_push_notification_failed', {
      errorCategory: 'provider',
      origin: 'auth',
      finality: 'retryable',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    /*
     Phase 2 Step 3:
     Admin access requires authenticated JWT + explicit admin role/flag.
     No runtime env-based bypass.
    */

    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Include role in token - support both role field and isAdmin mapping
    const tokenPayload = { id: user._id, username: user.username };
    if (user.role === 'admin') {
      tokenPayload.role = 'admin';
    } else if (user.isAdmin === true) {
      tokenPayload.isAdmin = true;
    }

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { username: user.username, role: user.role || (user.isAdmin ? 'admin' : 'user') } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Update push notification token for admin
router.post('/push-token', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { pushToken } = req.body;
    
    if (!pushToken) {
      return res.status(400).json({ error: 'Push token is required' });
    }
    
    // If user has an ID (database user), update their push token
    if (decoded.id) {
      await User.findByIdAndUpdate(decoded.id, { pushToken });
    } else {
      // Try to find user by username and update (for legacy tokens without ID)
      const user = await User.findOneAndUpdate(
        { username: decoded.username },
        { pushToken },
        { new: true }
      );
    }
    
    res.json({ message: 'Push token updated' });
  } catch (error) {
    logger.error('push_token_update_failed', {
      errorCategory: 'domain',
      origin: 'auth',
      finality: 'retryable',
      errorMessage: error.message
    });
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Reset badge count for admin
router.post('/reset-badge', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user's push token and reset badge
    if (decoded.id) {
      const user = await User.findById(decoded.id);
      if (user && user.pushToken) {
        const pushNotification = require('../services/pushNotification');
        pushNotification.resetBadgeCount(user.pushToken);
      }
    }
    
    res.json({ message: 'Badge count reset' });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Test push notification endpoint (for debugging)
// Only available in non-production environments
if (process.env.NODE_ENV !== 'production') {
  router.post('/test-notification', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user's push token
    if (decoded.id) {
      const user = await User.findById(decoded.id);
      if (user && user.pushToken) {
        const pushNotification = require('../services/pushNotification');
        const result = await pushNotification.sendTestNotification(user.pushToken);
        res.json({ message: 'Test notification sent', result, pushToken: user.pushToken });
      } else {
        res.status(400).json({ error: 'No push token registered for this user' });
      }
    } else {
      res.status(400).json({ error: 'User ID not found' });
    }
  } catch (error) {
    logger.error('admin_test_notification_failed', {
      errorCategory: 'provider',
      origin: 'auth',
      finality: 'retryable',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});
}

module.exports = router;

// STEP 2-3 COMPLETE WHEN:
// [ ] No admin route grants access without authenticate
// [ ] Admin-only routes enforce authorize(["admin"]) consistently
// [ ] No runtime env-based admin bypass remains
// [ ] Admin identity is explicit in JWT payload (role or isAdmin)
// [ ] No chatbot/whatsapp/webhook logic changed
// [ ] Reverting commit restores previous behavior
