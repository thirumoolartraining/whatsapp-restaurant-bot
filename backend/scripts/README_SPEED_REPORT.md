# WhatsApp Delivery Speed Report

## Overview
This script analyzes WhatsApp message delivery speed using existing `DeliveryStatus` and `OutboundMessage` data.

## Usage

### Prerequisites
1. MongoDB must be running and accessible
2. `.env` file must be configured with `MONGODB_URI`
3. Node.js dependencies installed (`npm install`)

### Running the Report
```bash
cd backend
node scripts/speedReport.js
```

## Output Format

The script generates a standardized report with the following sections:

### 1. Join Confirmation
- Confirms the join key between collections: `providerMessageId`

### 2. WhatsApp Network Latency (WNL)
- Sample size: Number of messages with both "sent" and "delivered" statuses
- Latency metrics: Min, p50, p90, p95, p99, Max (in seconds)
- Distribution percentages: % of messages delivered under 2s, 3s, 5s, 10s

### 3. End-to-End Latency (E2E)
- Sample size: Number of messages that can be joined to OutboundMessage
- Same metrics as WNL but for full enqueue-to-delivery timeline
- Note: Excludes % < 2s as specified in requirements

### 4. Top 5 Slowest Cases (E2E)
- Lists the 5 slowest messages by end-to-end latency
- Includes messageId, timestamps, and computed latency in seconds

## Data Sources

### DeliveryStatus Collection
- `messageId`: Unique message identifier
- `status`: "sent", "delivered", "failed", "read"
- `providerTimestamp`: Meta's timestamp for the event
- `receivedAt`: When our system received the webhook

### OutboundMessage Collection
- `providerMessageId`: Meta's message ID (join key)
- `createdAt`: When we queued the message
- `status`: "pending", "sent", "failed"

## Calculations

### WhatsApp Network Latency (WNL)
```
WNL = providerDeliveredAt - providerSentAt
```

### End-to-End Latency (E2E)
```
E2E = providerDeliveredAt - enqueueAt
```

## Notes

- Script is read-only and does not modify any data
- Uses the most recent 200 unique messageIds
- Only includes messages with complete "sent" → "delivered" flows
- Percentiles calculated using standard statistical methods
- All latency values displayed in seconds (rounded to 2 decimals)
