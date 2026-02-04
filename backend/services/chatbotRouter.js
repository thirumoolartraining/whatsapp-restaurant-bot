/*
 Phase 3 Step 3.2:
 Chatbot router introduction.
 Thin dispatch layer only.
 No behavior change.
*/

const chatbot = require('./chatbot');

function routeMessage(phone, text, messageType, selectedId, senderName) {
  // Direct delegation to chatbot with identical arguments
  return chatbot.handleMessage(phone, text, messageType, selectedId, senderName);
}

module.exports = {
  routeMessage
};

// PHASE 3 STEP 3.2 COMPLETE WHEN:
// [ ] chatbotRouter introduced as single dispatcher
// [ ] messageProcessor calls chatbotRouter only
// [ ] chatbot.js unchanged
// [ ] No behavior change observed
// [ ] Phase 1 & Phase 2 invariants preserved
// [ ] Removing router restores previous direct wiring
