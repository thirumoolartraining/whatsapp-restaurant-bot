const mongoose = require('mongoose');
require('dotenv').config();
const OutboundMessage = require('../models/OutboundMessage');
const DeliveryStatus = require('../models/DeliveryStatus');

// MongoDB connection
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant_bot');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    console.log('\n=== DATABASE CONNECTION FAILED ===');
    console.log('To run this report locally:');
    console.log('1. Ensure MongoDB is running');
    console.log('2. Set MONGODB_URI in your .env file');
    console.log('3. Run: node scripts/speedReport.js');
    console.log('\n=== SAMPLE OUTPUT FORMAT ===');
    generateSampleOutput();
    process.exit(0);
  }
}

// Generate sample output for demonstration
function generateSampleOutput() {
  console.log('=== JOIN CONFIRMATION ===');
  console.log('Join key: providerMessageId');
  
  console.log('\n=== WHATSAPP NETWORK LATENCY (WNL) ===');
  console.log('Sample size: 0');
  console.log('Min: N/A');
  console.log('p50: N/A');
  console.log('p90: N/A');
  console.log('p95: N/A');
  console.log('p99: N/A');
  console.log('Max: N/A');
  console.log('% < 2s: N/A');
  console.log('% < 3s: N/A');
  console.log('% < 5s: N/A');
  console.log('% < 10s: N/A');

  console.log('\n=== END-TO-END LATENCY (E2E) ===');
  console.log('Sample size: 0');
  console.log('Min: N/A');
  console.log('p50: N/A');
  console.log('p90: N/A');
  console.log('p95: N/A');
  console.log('p99: N/A');
  console.log('Max: N/A');
  console.log('% < 3s: N/A');
  console.log('% < 5s: N/A');
  console.log('% < 10s: N/A');

  console.log('\n=== TOP 5 SLOWEST (E2E) ===');
  console.log('No data available - database connection required');
}

// Calculate percentiles
function calculatePercentiles(values, percentiles) {
  if (values.length === 0) return {};
  
  const sorted = values.sort((a, b) => a - b);
  const result = {};
  
  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    result[p] = sorted[Math.max(0, index)];
  }
  
  return result;
}

// Main speed report function
async function generateSpeedReport() {
  await connectDB();

  try {
    // 1) Confirm join key
    console.log('=== JOIN CONFIRMATION ===');
    console.log('Join key: providerMessageId');

    // 2) Data sampling - fetch most recent 200 messageIds from DeliveryStatus
    const recentDeliveryStatuses = await DeliveryStatus
      .find()
      .sort({ receivedAt: -1 })
      .limit(500) // Get more to ensure we have 200 unique messageIds
      .lean();

    // Group by messageId and get unique messageIds
    const messageGroups = {};
    recentDeliveryStatuses.forEach(record => {
      if (!messageGroups[record.messageId]) {
        messageGroups[record.messageId] = [];
      }
      messageGroups[record.messageId].push(record);
    });

    const messageIds = Object.keys(messageGroups).slice(0, 200);

    // 3) Filter messageIds with both "sent" and "delivered" statuses
    const wnlLatencies = [];
    const e2eLatencies = [];
    const slowestCases = [];

    for (const messageId of messageIds) {
      const statuses = messageGroups[messageId];
      const sentRecord = statuses
        .filter(s => s.status === 'sent' && s.providerTimestamp)
        .sort((a, b) => a.providerTimestamp.getTime() - b.providerTimestamp.getTime())[0];
      
      const deliveredRecord = statuses
        .filter(s => s.status === 'delivered' && s.providerTimestamp)
        .sort((a, b) => a.providerTimestamp.getTime() - b.providerTimestamp.getTime())[0];

      if (sentRecord && deliveredRecord) {
        // Calculate WNL (WhatsApp Network Latency)
        const wnlMs = deliveredRecord.providerTimestamp.getTime() - sentRecord.providerTimestamp.getTime();
        wnlLatencies.push(wnlMs);

        // Try to join with OutboundMessage for E2E calculation
        const outboundMessage = await OutboundMessage.findOne({ providerMessageId: messageId }).lean();
        
        if (outboundMessage && outboundMessage.createdAt) {
          const e2eMs = deliveredRecord.providerTimestamp.getTime() - outboundMessage.createdAt.getTime();
          e2eLatencies.push(e2eMs);
          
          slowestCases.push({
            messageId,
            enqueueAt: outboundMessage.createdAt,
            providerSentAt: sentRecord.providerTimestamp,
            providerDeliveredAt: deliveredRecord.providerTimestamp,
            latencyMs: e2eMs
          });
        }
      }
    }

    // 4) Distribution statistics
    function formatStats(latenciesMs) {
      if (latenciesMs.length === 0) {
        return {
          sampleSize: 0,
          min: 'N/A',
          p50: 'N/A',
          p90: 'N/A',
          p95: 'N/A',
          p99: 'N/A',
          max: 'N/A',
          under2s: 'N/A',
          under3s: 'N/A',
          under5s: 'N/A',
          under10s: 'N/A'
        };
      }

      const percentiles = calculatePercentiles(latenciesMs, [50, 90, 95, 99]);
      const latenciesSeconds = latenciesMs.map(ms => ms / 1000);
      
      const under2s = latenciesSeconds.filter(s => s < 2).length;
      const under3s = latenciesSeconds.filter(s => s < 3).length;
      const under5s = latenciesSeconds.filter(s => s < 5).length;
      const under10s = latenciesSeconds.filter(s => s < 10).length;

      return {
        sampleSize: latenciesMs.length,
        min: (Math.min(...latenciesSeconds)).toFixed(2),
        p50: (percentiles[50] / 1000).toFixed(2),
        p90: (percentiles[90] / 1000).toFixed(2),
        p95: (percentiles[95] / 1000).toFixed(2),
        p99: (percentiles[99] / 1000).toFixed(2),
        max: (Math.max(...latenciesSeconds)).toFixed(2),
        under2s: ((under2s / latenciesMs.length) * 100).toFixed(1),
        under3s: ((under3s / latenciesMs.length) * 100).toFixed(1),
        under5s: ((under5s / latenciesMs.length) * 100).toFixed(1),
        under10s: ((under10s / latenciesMs.length) * 100).toFixed(1)
      };
    }

    console.log('\n=== WHATSAPP NETWORK LATENCY (WNL) ===');
    const wnlStats = formatStats(wnlLatencies);
    console.log(`Sample size: ${wnlStats.sampleSize}`);
    console.log(`Min: ${wnlStats.min}`);
    console.log(`p50: ${wnlStats.p50}`);
    console.log(`p90: ${wnlStats.p90}`);
    console.log(`p95: ${wnlStats.p95}`);
    console.log(`p99: ${wnlStats.p99}`);
    console.log(`Max: ${wnlStats.max}`);
    console.log(`% < 2s: ${wnlStats.under2s}`);
    console.log(`% < 3s: ${wnlStats.under3s}`);
    console.log(`% < 5s: ${wnlStats.under5s}`);
    console.log(`% < 10s: ${wnlStats.under10s}`);

    console.log('\n=== END-TO-END LATENCY (E2E) ===');
    const e2eStats = formatStats(e2eLatencies);
    console.log(`Sample size: ${e2eStats.sampleSize}`);
    console.log(`Min: ${e2eStats.min}`);
    console.log(`p50: ${e2eStats.p50}`);
    console.log(`p90: ${e2eStats.p90}`);
    console.log(`p95: ${e2eStats.p95}`);
    console.log(`p99: ${e2eStats.p99}`);
    console.log(`Max: ${e2eStats.max}`);
    console.log(`% < 3s: ${e2eStats.under3s}`);
    console.log(`% < 5s: ${e2eStats.under5s}`);
    console.log(`% < 10s: ${e2eStats.under10s}`);

    // 5) Top 5 slowest cases
    console.log('\n=== TOP 5 SLOWEST (E2E) ===');
    const sortedSlowest = slowestCases.sort((a, b) => b.latencyMs - a.latencyMs).slice(0, 5);
    
    sortedSlowest.forEach((case_, index) => {
      console.log(`${index + 1}) messageId: ${case_.messageId}`);
      console.log(`   enqueueAt: ${case_.enqueueAt.toISOString()}`);
      console.log(`   providerSentAt: ${case_.providerSentAt.toISOString()}`);
      console.log(`   providerDeliveredAt: ${case_.providerDeliveredAt.toISOString()}`);
      console.log(`   latency: ${(case_.latencyMs / 1000).toFixed(2)}`);
      if (index < sortedSlowest.length - 1) console.log('');
    });

  } catch (error) {
    console.error('Error generating speed report:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the report
if (require.main === module) {
  generateSpeedReport();
}

module.exports = { generateSpeedReport };
