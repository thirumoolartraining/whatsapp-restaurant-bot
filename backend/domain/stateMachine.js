/*
Phase 6 T1: State Machine Module
Enforces explicit, auditable state transitions with denial-by-default.
*/

class StateTransitionError extends Error {
  constructor(message, code, fromState, toState) {
    super(message);
    this.name = 'StateTransitionError';
    this.code = code;
    this.fromState = fromState;
    this.toState = toState;
  }
}

// Canonical state enumeration based on existing codebase analysis
const CANONICAL_STATES = new Set([
  'welcome',
  'main_menu',
  'select_food_type',
  'select_food_type_order',
  'browsing_menu',
  'select_category',
  'viewing_items',
  'selecting_item',
  'viewing_item_details',
  'select_item',
  'cart_options',
  'viewing_cart',
  'item_added',
  'select_cancel',
  'select_refund',
  'select_track',
  'awaiting_location',
  'select_payment_method',
  'order_placed'
]);

// Conservative minimal state graph based on existing flows
// Format: fromState -> Set(allowedToStates)
const STATE_GRAPH = new Map([
  ['welcome', new Set(['main_menu'])],
  ['main_menu', new Set(['select_food_type', 'select_food_type_order', 'cart_options', 'viewing_cart', 'select_cancel', 'select_refund', 'select_track', 'awaiting_location'])],
  ['select_food_type', new Set(['select_category', 'browsing_menu', 'main_menu'])],
  ['select_food_type_order', new Set(['browsing_menu', 'main_menu'])],
  ['browsing_menu', new Set(['select_category', 'selecting_item', 'main_menu'])],
  ['select_category', new Set(['viewing_items', 'selecting_item', 'main_menu'])],
  ['viewing_items', new Set(['selecting_item', 'viewing_item_details', 'main_menu'])],
  ['selecting_item', new Set(['viewing_item_details', 'item_added', 'main_menu'])],
  ['viewing_item_details', new Set(['selecting_item', 'item_added', 'main_menu'])],
  ['select_item', new Set(['viewing_item_details', 'main_menu'])],
  ['cart_options', new Set(['viewing_cart', 'main_menu'])],
  ['viewing_cart', new Set(['selecting_item', 'awaiting_location', 'main_menu'])],
  ['item_added', new Set(['viewing_cart', 'selecting_item', 'main_menu'])],
  ['select_cancel', new Set(['main_menu', 'welcome'])],
  ['select_refund', new Set(['main_menu', 'welcome'])],
  ['select_track', new Set(['main_menu', 'welcome'])],
  ['awaiting_location', new Set(['select_payment_method', 'main_menu'])],
  ['select_payment_method', new Set(['order_placed', 'main_menu'])],
  ['order_placed', new Set(['main_menu', 'welcome'])]
]);

/**
 * Returns canonical state string or "UNKNOWN"
 */
function normalizeState(state) {
  if (!state || typeof state !== 'string') {
    return 'UNKNOWN';
  }
  const trimmed = state.trim().toLowerCase();
  return CANONICAL_STATES.has(trimmed) ? trimmed : 'UNKNOWN';
}

/**
 * Checks if transition is allowed based on state graph
 */
function isTransitionAllowed(fromState, toState) {
  // Allow initial transition from null/undefined to welcome
  if (fromState === null || fromState === undefined || fromState === '') {
    const normalizedTo = normalizeState(toState);
    return normalizedTo === 'welcome';
  }
  
  const normalizedFrom = normalizeState(fromState);
  const normalizedTo = normalizeState(toState);
  
  // Denial-by-default: unknown states are not allowed
  if (normalizedFrom === 'UNKNOWN' || normalizedTo === 'UNKNOWN') {
    return false;
  }
  
  // Check state graph
  const allowedTransitions = STATE_GRAPH.get(normalizedFrom);
  return allowedTransitions ? allowedTransitions.has(normalizedTo) : false;
}

/**
 * Asserts transition is allowed, throws typed error if denied
 */
function assertTransitionAllowed({ fromState, toState, correlationId, actor, context }) {
  if (!correlationId) {
    throw new StateTransitionError(
      'Missing correlationId for state transition',
      'MISSING_CONTEXT',
      fromState,
      toState
    );
  }
  
  if (!context || (!context.customerId && !context.phone)) {
    throw new StateTransitionError(
      'Missing customer identifier for state transition',
      'MISSING_CONTEXT',
      fromState,
      toState
    );
  }
  
  const normalizedFrom = normalizeState(fromState);
  const normalizedTo = normalizeState(toState);
  
  if (normalizedFrom === 'UNKNOWN') {
    throw new StateTransitionError(
      `Unknown fromState: ${fromState}`,
      'UNKNOWN_STATE',
      fromState,
      toState
    );
  }
  
  if (normalizedTo === 'UNKNOWN') {
    throw new StateTransitionError(
      `Unknown toState: ${toState}`,
      'UNKNOWN_STATE',
      fromState,
      toState
    );
  }
  
  if (!isTransitionAllowed(fromState, toState)) {
    throw new StateTransitionError(
      `Transition not allowed: ${normalizedFrom} -> ${normalizedTo}`,
      'EDGE_NOT_ALLOWED',
      fromState,
      toState
    );
  }
}

module.exports = {
  StateTransitionError,
  normalizeState,
  isTransitionAllowed,
  assertTransitionAllowed,
  CANONICAL_STATES,
  STATE_GRAPH
};
