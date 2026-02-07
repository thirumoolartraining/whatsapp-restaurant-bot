const fs = require('fs');
const path = require('path');

// Log monitoring for Step 4 notification testing
class NotificationLogMonitor {
  constructor() {
    this.logFile = path.join(__dirname, '../backend/logs/app.log');
    this.testResults = [];
    this.currentTest = null;
  }

  // Start monitoring for a specific test case
  startTest(testId, platform, appState) {
    this.currentTest = {
      testId,
      platform,
      appState,
      startTime: new Date(),
      events: []
    };
    console.log(`\n🧪 Starting ${platform} ${appState} test at ${this.currentTest.startTime.toISOString()}`);
  }

  // Monitor logs for notification dispatch events
  async monitorForNotification(timeoutMs = 30000) {
    return new Promise((resolve) => {
      if (!this.currentTest) {
        resolve(null);
        return;
      }

      let timeout = setTimeout(() => {
        resolve(null);
      }, timeoutMs);

      // Check existing log content
      this.checkLogFile(timeout, resolve);
      
      // Set up file watcher for new logs
      if (fs.existsSync(this.logFile)) {
        const watcher = fs.watch(this.logFile, (eventType) => {
          if (eventType === 'change') {
            this.checkLogFile(timeout, resolve);
          }
        });

        setTimeout(() => {
          watcher.close();
        }, timeoutMs);
      }
    });
  }

  checkLogFile(timeout, resolve) {
    try {
      if (!fs.existsSync(this.logFile)) return;

      const logContent = fs.readFileSync(this.logFile, 'utf8');
      const lines = logContent.split('\n');
      
      for (const line of lines) {
        if (line.includes('admin_new_order_push_dispatched')) {
          clearTimeout(timeout);
          
          // Parse the log entry
          const logEntry = this.parseNotificationLog(line);
          if (logEntry && logEntry.timestamp >= this.currentTest.startTime) {
            this.currentTest.events.push(logEntry);
            console.log(`✅ Notification dispatch detected: Order ${logEntry.orderId}`);
            resolve(logEntry);
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error reading log file:', error);
    }
  }

  parseNotificationLog(logLine) {
    try {
      // Extract timestamp, orderId, and other details from log line
      const timestampMatch = logLine.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
      const orderIdMatch = logLine.match(/orderId[\":=]\s*[\"']?([A-Za-z0-9]+)[\"']?/);
      
      return {
        timestamp: timestampMatch ? new Date(timestampMatch[1]) : new Date(),
        orderId: orderIdMatch ? orderIdMatch[1] : 'unknown',
        rawLog: logLine
      };
    } catch (error) {
      return null;
    }
  }

  // End current test and record results
  endTest(notificationReceived, navigationSuccess, orderExists, duplicateFound, evidenceFiles, notes) {
    if (!this.currentTest) return;

    const result = {
      ...this.currentTest,
      endTime: new Date(),
      notificationReceived,
      navigationSuccess,
      orderExists,
      duplicateFound,
      evidenceFiles,
      notes,
      duration: new Date() - this.currentTest.startTime
    };

    this.testResults.push(result);
    console.log(`\n📊 Test completed in ${result.duration}ms`);
    console.log(`   Notification: ${notificationReceived ? '✅' : '❌'}`);
    console.log(`   Navigation: ${navigationSuccess ? '✅' : '❌'}`);
    console.log(`   Order in DB: ${orderExists ? '✅' : '❌'}`);
    console.log(`   Duplicates: ${duplicateFound ? '❌' : '✅'}`);

    this.currentTest = null;
    return result;
  }

  // Generate results table
  generateResultsTable() {
    console.log('\n📋 STEP 4 TEST RESULTS TABLE');
    console.log('| Platform | App State | Notification Received | Tap Navigates Correctly | Order Exists in DB | Duplicate Notification? | Evidence Files | Notes |');
    console.log('|----------|-----------|---------------------|-------------------------|-------------------|-------------------------|----------------|-------|');

    for (const result of this.testResults) {
      const platform = result.platform;
      const state = result.appState;
      const notif = result.notificationReceived ? 'Y' : 'N';
      const nav = result.navigationSuccess ? 'Y' : 'N';
      const order = result.orderExists ? 'Y' : 'N';
      const dup = result.duplicateFound ? 'Y' : 'N';
      const evidence = result.evidenceFiles?.join(', ') || '';
      const notes = result.notes || '';

      console.log(`| ${platform} | ${state} | ${notif} | ${nav} | ${order} | ${dup} | ${evidence} | ${notes} |`);
    }

    // Calculate success metrics
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(t => 
      t.notificationReceived && t.navigationSuccess && t.orderExists && !t.duplicateFound
    ).length;

    console.log(`\n📊 SUMMARY: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
    
    if (passedTests === totalTests && totalTests === 6) {
      console.log('🎉 ALL TESTS PASSED - PRODUCTION READY');
    } else {
      console.log('❌ TESTS FAILED - NOT PRODUCTION READY');
    }
  }

  // Export results to file
  exportResults(filePath) {
    const results = {
      testRun: {
        timestamp: new Date().toISOString(),
        totalTests: this.testResults.length,
        passedTests: this.testResults.filter(t => 
          t.notificationReceived && t.navigationSuccess && t.orderExists && !t.duplicateFound
        ).length
      },
      results: this.testResults
    };

    fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results exported to ${filePath}`);
  }
}

module.exports = NotificationLogMonitor;
