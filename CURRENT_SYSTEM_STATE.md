# CURRENT_SYSTEM_STATE

## 1. Purpose of This Document

This file is the authoritative description of the WhatsApp Restaurant Bot system's current behavior. It documents only what is provably true in the codebase today, overriding any other documentation if conflicts exist. This is the source of truth for engineers, operators, and reviewers.

## 2. What the System Guarantees

### Delivery Truth
- Every outbound WhatsApp message creates an `OutboundMessage` record with provider message ID
- All delivery status events (sent, delivered, failed, read) from Meta webhooks are persisted to `DeliveryStatus` collection
- Delivery status processing is idempotent using `rawEventId` to prevent duplicates
- Correlation between outbound messages and delivery status is attempted via `providerMessageId`

### State Safety
- Customer conversation state transitions are enforced by a state machine with denial-by-default behavior
- Only transitions defined in `STATE_GRAPH` are allowed; unknown states or transitions are rejected
- State transitions require correlation ID and customer identifier for auditability

### Environment Fail-Fast
- System validates all required environment variables at startup
- Missing or invalid environment variables cause immediate shutdown with error logging
- Production environment requires Meta WhatsApp configuration; non-production warns and continues

### Abuse Prevention
- Inbound messages are rate-limited per phone number (default: 30/minute)
- Outbound messages are rate-limited per phone number (default: 30/minute)
- Repeated violations trigger automatic phone lockout (default: 10 minutes)
- High-risk administrative actions are capped per correlation ID

## 3. End-to-End Message Lifecycle (Truth View)

1. **Inbound Message Reception**
   - Meta webhook receives WhatsApp message at `/api/webhook/meta`
   - Signature verification and rate limiting applied immediately
   - System responds with 200 OK before processing to prevent timeouts

2. **Abuse and Scope Validation**
   - Phone lockout status checked; locked phones receive safe message and are rejected
   - Inbound rate limits enforced; violations trigger safe message and rejection
   - Message scope validated against allowed actions

3. **Message Processing**
   - Message routed through `messageProcessor.processInboundMessage()`
   - Idempotency check via `InboundMessage` collection prevents duplicate processing
   - Deterministic fallback keys generated when provider message ID is missing
   - Message delegated to `chatbotRouter.routeMessage()` then `chatbot.handleMessage()`

4. **State Management**
   - Customer conversation state retrieved and validated
   - State transitions checked against `STATE_GRAPH` in `stateMachine.js`
   - Invalid transitions throw `StateTransitionError`

5. **Outbound Message Generation**
   - Response messages created via `whatsapp.js` service methods
   - Outbound rate limits enforced per phone number
   - `OutboundMessage` record created with `pending` status
   - Message sent to Meta WhatsApp Cloud API

6. **Queue Processing (if Redis available)**
   - WhatsApp messages enqueued in BullMQ with retry configuration
   - When Redis is unavailable, outbound messages execute synchronously in-process with reduced isolation guarantees
   - Transient failures retry up to 2 times with exponential backoff
   - Policy failures never retry
   - Workers process jobs sequentially with correlation ID preservation

7. **Delivery Status Tracking**
   - Meta webhooks deliver status events asynchronously
   - Each status event creates `DeliveryStatus` record
   - Correlation attempted with original `OutboundMessage`
   - All events persisted regardless of correlation success

## 4. State Management & Safety Model

### State Machine Implementation
- **Canonical States**: 37 defined states from 'welcome' to 'order_placed'
- **State Graph**: Directed graph with allowed transitions only
- **Normalization**: All state strings normalized to lowercase and validated
- **Denial-by-Default**: Unknown states or transitions automatically rejected

### Drift Prevention
- State transitions require explicit correlation ID and customer context
- All state changes emit structured audit logs
- Invalid transitions throw typed `StateTransitionError` with context

### State Persistence
- Customer conversation state stored in `Customer` collection
- Cart items persisted with menu item references
- State recovery available through intervention framework

## 5. Failure Handling & Isolation

### Retry Strategy
- **WhatsApp Messages**: Up to 2 retries (3 total attempts including the initial send) for transient failures
- **Backoff**: Exponential with 10-second base delay
- **Policy Failures**: Never retry (authentication errors, policy violations)
- **Intervention Overrides**: Per-correlation retry overrides available with abuse limits

### Error Classification
- **Transient**: Network timeouts, rate limits, temporary service unavailability
- **Policy**: Authentication failures, permission errors, invalid message format
- **Unknown**: Treated as policy failures (conservative approach)

### Isolation Boundaries
- Webhook processing errors don't prevent 200 OK response
- Individual status event failures don't stop batch processing
- Queue worker failures are isolated per job
- Database connection failures trigger graceful degradation

## 6. Concurrency & Ordering Assumptions

### Message Ordering
- No guaranteed ordering between inbound and outbound messages
- State transitions are atomic per customer
- Concurrent messages from same customer processed sequentially by abuse limits

### Queue Behavior
- BullMQ provides FIFO ordering per queue when Redis available
- Workers process jobs one at a time (concurrency: 1)
- In-process mode executes immediately without queuing

### Race Condition Prevention
- Database unique constraints prevent duplicate message processing
- Atomic counter operations for abuse detection
- State machine prevents invalid concurrent transitions

## 7. Observability & Auditability

### Log Structure
- All events use structured JSON logging with correlation IDs
- Entry/exit patterns for major operations
- Error categorization (infrastructure, provider, validation, unknown)

### Persisted Audit Trail
- **InboundMessage**: Record of all processed inbound messages
- **OutboundMessage**: Record of all outbound attempts with status
- **DeliveryStatus**: Complete delivery event history from Meta
- **Intervention**: Administrative actions with execution results

### Reconstruction Capability
- Full message conversation flow reconstructable from message logs
- Delivery timeline reconstructable from delivery status events
- State transition history reconstructable from audit logs
- Abuse violation history reconstructable from abuse guard events

## 8. Environment & Production Requirements

### Required Environment Variables
**Core Requirements:**
- `PORT`: Server port
- `NODE_ENV`: Environment (production/non-production)
- `MONGODB_URI`: Database connection string
- `JWT_SECRET`: Authentication secret

**Production-Only Requirements:**
- `META_ACCESS_TOKEN`: WhatsApp API access token
- `META_PHONE_NUMBER_ID`: WhatsApp phone number ID
- `META_BUSINESS_ID`: Meta business account ID
- `META_APP_SECRET`: Webhook verification secret

**Optional Integrations:**
- `GROQ_API_KEY`: AI transcription and processing
- `GOOGLE_SHEETS_*`: Spreadsheet integration
- `RAZORPAY_*`: Payment processing
- `CLOUDINARY_*`: Media storage

### Behavior in Non-Production
- WhatsApp webhook routes available for testing
- Missing Meta variables generate warnings, not failures
- Test endpoints enabled for manual message simulation
- Debug endpoints available for state inspection

### Webhook Dependency
- Production requires publicly accessible webhook endpoint
- Meta webhook verification required during setup
- Signature verification enforced for all webhook requests
- Immediate 200 response required to prevent webhook timeouts

## 9. Explicit Non-Goals & Out-of-Scope

### Not Implemented
- **Dead Letter Queue**: No DLQ for permanently failed jobs
- **SLA Guarantees**: No service level agreements or uptime promises
- **Monitoring Dashboards**: No real-time monitoring UI
- **Auto-scaling**: No automatic scaling based on load
- **Message Broadcasting**: No bulk message sending capabilities
- **Priority Queuing**: All jobs processed FIFO only
- **Manual Replay**: No manual job replay interface
- **Multi-tenant**: Single restaurant deployment only

### Intentional Limitations
- WhatsApp provider only (no SMS, email, etc.)
- Primary language support: English. Other languages may exist but are not formally supported or guaranteed.
- No customer segmentation or personalization
- No A/B testing or feature flags
- No analytics beyond basic logging

## 10. Relationship to Other Documentation

### Canonical (This Document)
- **CURRENT_SYSTEM_STATE.md**: Authoritative description of current behavior

### Historical
- **README.md**: General setup and overview information
- **LOCAL_SETUP.md**: Development environment setup instructions
- **RUNBOOK_DEV.md**: Development operational procedures

### Phase-Specific
- **ABUSE_CONSTRAINTS_IMPLEMENTATION.md**: Abuse prevention implementation details
- **DELIVERY_VISIBILITY_VERIFICATION.md**: Delivery tracking verification report
- **RETRY_IMPLEMENTATION_VERIFICATION.md**: Retry mechanism verification

### Verification Artifacts
- **SMOKE_TESTS.md**: System health verification procedures
- **SYSTEM_DOCUMENTATION.md**: High-level architecture overview
- **META_BUSINESS_VERIFICATION_GUIDE.md**: Meta platform setup guide

### Code Comments
- Phase-specific implementation notes in source files
- Temporary development markers (e.g., "PHASE 3 STEP 0 COMPLETE")
- Inline documentation for complex algorithms

---

**Document Status**: Current as of codebase analysis date. This document reflects only implemented behavior, not planned features or theoretical capabilities.
