# Phase 1 Smoke Tests

## PURPOSE
Manual verification steps to be performed after EACH Phase 1 change to ensure no regression.

## TEST EXECUTION ORDER
Execute tests in the exact order listed. Stop on first failure.

## TEST 1: STARTUP CHECKS

### Procedure
1. Stop any running backend server
2. Start backend server: `npm start`
3. Monitor startup logs for 30 seconds

### PASS Criteria
- Server starts without errors
- All dependencies load successfully
- Database connection established
- No uncaught exceptions during startup
- Server listening on expected port

### FAIL Criteria
- Server fails to start
- Error messages during startup
- Database connection failures
- Port binding issues
- Missing dependency errors

---

## TEST 2: WEBHOOK REPLAY CHECK

### Procedure
1. Capture a sample Meta webhook payload (or use existing test payload)
2. Send the same payload twice to `POST /webhook/meta`
3. Verify both requests receive identical responses
4. Check server logs for proper handling

### PASS Criteria
- Both requests return same HTTP status code
- Both requests return same response body
- No duplicate processing errors
- Proper idempotency handling
- No database inconsistencies

### FAIL Criteria
- Different responses between identical requests
- Duplicate processing errors
- Database state changes on second request
- Timeout on second request
- Error 500 on either request

---

## TEST 3: WHATSAPP MESSAGE SEND CHECK

### Procedure
1. Send a test WhatsApp message to the system
2. Verify message is received and processed
3. Check that appropriate response is sent back
4. Monitor server logs throughout the flow

### PASS Criteria
- Message received successfully
- Response generated and sent
- No errors in processing pipeline
- Proper logging of message flow
- Response arrives within expected time

### FAIL Criteria
- Message not received
- No response generated
- Error in message processing
- Timeout in response
- Logging failures

---

## TEST 4: ORDER FLOW SANITY CHECK

### Procedure
1. Initiate a test order through WhatsApp
2. Complete the order flow to confirmation
3. Verify all order steps are processed correctly
4. Check database for order consistency

### PASS Criteria
- Order created successfully
- All order steps processed
- Database state consistent
- Customer receives confirmations
- No errors in order processing

### FAIL Criteria
- Order creation fails
- Missing order steps
- Database inconsistencies
- Customer not notified
- Processing errors

---

## TEST 5: ROLLBACK SAFETY CHECK

### Procedure
1. Note current Git commit hash
2. Revert the last change: `git revert HEAD`
3. Restart server
4. Run Tests 1-4 again on reverted code

### PASS Criteria
- All previous tests still pass on reverted code
- Server starts successfully after revert
- No dependency issues after revert
- System behavior identical to pre-change state

### FAIL Criteria
- Tests fail on reverted code
- Server won't start after revert
- Dependency issues after revert
- Behavior differs from expected baseline

---

## TEST RESULT DOCUMENTATION

### Required Information for Each Test Run
- Date and time
- Developer name
- Change description
- Test results (PASS/FAIL) for each test
- Any anomalies observed
- Actions taken for failures

### Template
```
Date: YYYY-MM-DD HH:MM
Developer: [Name]
Change: [Brief description]

TEST 1 - Startup: [PASS/FAIL]
TEST 2 - Webhook Replay: [PASS/FAIL]
TEST 3 - WhatsApp Send: [PASS/FAIL]
TEST 4 - Order Flow: [PASS/FAIL]
TEST 5 - Rollback Safety: [PASS/FAIL]

Notes: [Any observations]
```

## CRITICAL FAILURE PROTOCOL

### Immediate Actions
1. STOP all further changes
2. Document the failure details
3. Revert the problematic change
4. Verify system returns to working state
5. Analyze root cause before proceeding

### Blocker Criteria
- Any FAIL in Test 1 (Startup)
- FAIL in Test 2 (Webhook Replay) - indicates idempotency issues
- Multiple FAIL tests
- Rollback Safety Test failure

## SUCCESS CRITERIA
- All 5 tests PASS
- No anomalies observed
- System behavior unchanged from baseline
- Ready for production deployment

Remember: Phase 1 changes must pass ALL smoke tests before being considered complete.
