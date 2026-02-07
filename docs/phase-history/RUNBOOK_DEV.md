# Phase 1 Development Runbook

## PURPOSE
Safe local development and sanity-check procedures for Phase 1 stabilization.

## PRE-REQUISITES
- Node.js installed
- Git repository cloned
- Existing .env file present (DO NOT MODIFY)

## BACKEND STARTUP PROCEDURE

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Start Backend Server
```bash
npm start
```
- Expected output: Server listening on port (check .env for PORT)
- No errors during startup

### 3. Verify Server Health
```bash
curl http://localhost:[PORT]/health
```
- Expected: 200 OK response
- If no health endpoint, check for server console logs indicating successful startup

## WEBHOOK ENDPOINT VERIFICATION

### 1. Confirm Meta Webhook Reachability
```bash
curl -X POST http://localhost:[PORT]/webhook/meta
```
- Expected: 200 OK or appropriate webhook response
- Verify endpoint exists and responds

### 2. Confirm WhatsApp Webhook Reachability
```bash
curl -X POST http://localhost:[PORT]/webhook/whatsapp
```
- Expected: 200 OK or appropriate webhook response
- Verify endpoint exists and responds

## BASIC WHATSAPP FLOW SANITY CHECK

### High-Level Verification Steps
1. Send a test message to the WhatsApp number
2. Verify message is received by the system
3. Check that appropriate response is generated
4. Confirm no errors in server logs
5. Verify database state remains consistent

### Log Monitoring
- Monitor server console for errors
- Check for proper logging of incoming messages
- Verify error handling is working correctly

## CRITICAL WARNINGS

### ⚠️ DO NOT CHANGE ENV DURING PHASE 1
- Environment variables are FROZEN
- No modifications to .env files
- No new environment variables
- Use existing configuration only

### ⚠️ NO BEHAVIOR CHANGES
- Do not modify chatbot responses
- Do not change business logic
- Do not alter user-facing features
- Focus only on stabilization fixes

## TROUBLESHOOTING CHECKLIST

### Server Won't Start
- Check Node.js version compatibility
- Verify all dependencies installed
- Check for port conflicts
- Review .env configuration (do not modify)

### Webhook Not Responding
- Verify server is running
- Check endpoint routes exist
- Confirm proper middleware configuration
- Review error logs

### Database Issues
- Verify database connection
- Check for proper credentials in .env
- Review database service status
- Do not modify schema during Phase 1

## SANITY CHECK COMPLETION
- [ ] Backend server starts successfully
- [ ] Health endpoint responds (if available)
- [ ] Meta webhook endpoint reachable
- [ ] WhatsApp webhook endpoint reachable
- [ ] No startup errors in logs
- [ ] Basic message flow test passes
- [ ] No environment variables modified

## EMERGENCY STOP
If any unexpected behavior occurs:
1. Stop the server immediately
2. Review changes made
3. Revert to previous commit if necessary
4. Document the issue

Remember: Phase 1 is about stabilization, not new development.
