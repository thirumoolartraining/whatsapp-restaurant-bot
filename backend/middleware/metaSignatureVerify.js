/*
   Phase 2 Step 1:
   Meta webhook signature verification.
   Rejects unsigned or invalid webhook requests.
   Uses raw request body buffer for signature verification.
   Downstream behavior unchanged.
 */

const crypto = require('crypto');

function metaSignatureVerify(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = process.env.META_APP_SECRET;

  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }

  if (!appSecret) {
    return res.status(401).json({ error: 'Missing app secret' });
  }

  const expectedPrefix = 'sha256=';
  if (!signature.startsWith(expectedPrefix)) {
    return res.status(401).json({ error: 'Invalid signature format' });
  }

  const receivedHash = signature.slice(expectedPrefix.length);
  
  if (!req.rawBody) {
    return res.status(401).json({ error: 'Missing raw body' });
  }

  const computedHash = crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody)
    .digest('hex');

  const receivedBuffer = Buffer.from(receivedHash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');

  if (receivedBuffer.length !== computedBuffer.length) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (crypto.timingSafeEqual(receivedBuffer, computedBuffer)) {
    return next();
  } else {
    return res.status(401).json({ error: 'Invalid signature' });
  }
}

module.exports = metaSignatureVerify;

// STEP 2-1 PATCH COMPLETE WHEN:
// [ ] HMAC uses raw request body buffer
// [ ] JSON.stringify is NOT used for verification
// [ ] req.body remains untouched
// [ ] Invalid/missing raw body rejected with 401
// [ ] Phase 1 invariants preserved
