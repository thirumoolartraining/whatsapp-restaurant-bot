/*
 Phase 3 Step 3.3:
 Conversation state manager extraction.
 Centralizes state read/write/reset.
 No behavior change.
*/

const Customer = require('../models/Customer');

async function getState(userId, providerContext = {}) {
  const { phone } = providerContext;
  if (!phone) {
    throw new Error('Phone number required for state access');
  }
  
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    return { currentStep: 'welcome' };
  }
  
  return customer.conversationState || { currentStep: 'welcome' };
}

async function setState(userId, partialState, providerContext = {}) {
  const { phone } = providerContext;
  if (!phone) {
    throw new Error('Phone number required for state update');
  }
  
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    throw new Error('Customer not found for state update');
  }
  
  // Initialize conversationState if it doesn't exist
  if (!customer.conversationState) {
    customer.conversationState = { currentStep: 'welcome' };
  }
  
  // Apply partial state updates
  Object.assign(customer.conversationState, partialState);
  customer.conversationState.lastInteraction = new Date();
  
  await customer.save();
  return customer.conversationState;
}

async function updateState(userId, updaterFn, providerContext = {}) {
  const { phone } = providerContext;
  if (!phone) {
    throw new Error('Phone number required for state update');
  }
  
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    throw new Error('Customer not found for state update');
  }
  
  // Initialize conversationState if it doesn't exist
  if (!customer.conversationState) {
    customer.conversationState = { currentStep: 'welcome' };
  }
  
  // Apply updater function
  const updatedState = updaterFn(customer.conversationState);
  if (updatedState !== undefined) {
    customer.conversationState = updatedState;
  }
  customer.conversationState.lastInteraction = new Date();
  
  await customer.save();
  return customer.conversationState;
}

async function resetState(userId, providerContext = {}) {
  const { phone } = providerContext;
  if (!phone) {
    throw new Error('Phone number required for state reset');
  }
  
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    throw new Error('Customer not found for state reset');
  }
  
  customer.conversationState = { currentStep: 'welcome' };
  customer.conversationState.lastInteraction = new Date();
  
  await customer.save();
  return customer.conversationState;
}

module.exports = {
  getState,
  setState,
  updateState,
  resetState
};

// PHASE 3 STEP 3.3 COMPLETE WHEN:
// [ ] All state read/write/reset in chatbot.js routed through conversationState
// [ ] No state schema changes introduced
// [ ] chatbot behavior unchanged
// [ ] Router and messageProcessor unchanged except parameter plumbing (if any)
// [ ] Phase 1 & Phase 2 invariants preserved
// [ ] Reverting restores previous inline state access
