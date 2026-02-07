const NotificationLogMonitor = require('./log_monitor');
const fs = require('fs');
const path = require('path');

class Step4TestExecutor {
  constructor() {
    this.monitor = new NotificationLogMonitor();
    this.evidenceDir = path.join(__dirname, 'evidence');
    this.ensureEvidenceDir();
  }

  ensureEvidenceDir() {
    if (!fs.existsSync(this.evidenceDir)) {
      fs.mkdirSync(this.evidenceDir, { recursive: true });
    }
  }

  // Execute a single test case
  async executeTest(platform, appState, testInstructions) {
    const testId = `${platform}_${appState}`.toLowerCase();
    
    console.log(`\n🎯 EXECUTING: ${platform.toUpperCase()} ${appState.toUpperCase()} TEST`);
    console.log('=' .repeat(60));
    
    // Start monitoring
    this.monitor.startTest(testId, platform, appState);
    
    // Display test instructions
    console.log('\n📋 TEST INSTRUCTIONS:');
    console.log(testInstructions);
    console.log('\n⏱️  Waiting for notification dispatch...');
    
    // Wait for notification (30 second timeout)
    const notificationEvent = await this.monitor.monitorForNotification(30000);
    
    if (!notificationEvent) {
      console.log('❌ No notification dispatch detected within timeout');
      this.promptForManualResults(platform, appState, testId);
      return;
    }
    
    console.log(`✅ Notification dispatched for Order: ${notificationEvent.orderId}`);
    console.log('\n📱 Please verify the following on device:');
    console.log('1. Notification appeared in tray/banner');
    console.log('2. Tapping notification opens app to Orders screen');
    console.log('3. Correct order is visible in the list');
    
    this.promptForManualResults(platform, appState, testId, notificationEvent.orderId);
  }

  promptForManualResults(platform, appState, testId, orderId = null) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n🔍 ENTER TEST RESULTS:');
    
    const questions = [
      'Notification received on device? (y/n): ',
      'Tapping notification navigates correctly? (y/n): ',
      'Order exists in app/database? (y/n): ',
      'Any duplicate notifications? (y/n): ',
      'Evidence files (screenshots/videos, comma separated): ',
      'Additional notes (1 line): '
    ];

    let answers = [];
    let currentQuestion = 0;

    const askQuestion = () => {
      if (currentQuestion < questions.length) {
        rl.question(questions[currentQuestion], (answer) => {
          answers.push(answer.trim());
          currentQuestion++;
          askQuestion();
        });
      } else {
        // Process results
        const [notifReceived, navSuccess, orderExists, duplicates, evidence, notes] = answers;
        
        const result = this.monitor.endTest(
          notifReceived.toLowerCase() === 'y',
          navSuccess.toLowerCase() === 'y', 
          orderExists.toLowerCase() === 'y',
          duplicates.toLowerCase() === 'y',
          evidence ? evidence.split(',').map(f => f.trim()) : [],
          notes
        );

        // Save evidence files info
        if (evidence && orderId) {
          this.saveEvidenceInfo(testId, orderId, evidence, notes);
        }

        rl.close();
      }
    };

    askQuestion();
  }

  saveEvidenceInfo(testId, orderId, evidenceFiles, notes) {
    const evidenceInfo = {
      testId,
      orderId,
      timestamp: new Date().toISOString(),
      evidenceFiles,
      notes,
      logFile: '../backend/logs/app.log'
    };

    const evidenceFile = path.join(this.evidenceDir, `${testId}_${orderId}.json`);
    fs.writeFileSync(evidenceFile, JSON.stringify(evidenceInfo, null, 2));
  }

  // Run all 6 test cases
  async runFullTestMatrix() {
    console.log('🚀 STEP 4 PRODUCTION GATE TESTING');
    console.log('=====================================');
    console.log('This will execute all 6 test cases:');
    console.log('- Android: Foreground, Background, Killed');
    console.log('- iOS: Foreground, Background, Killed');
    console.log('\n⚠️  Ensure you have:');
    console.log('1. Android release build installed (NOT Expo Go)');
    console.log('2. iOS EAS build installed via TestFlight');
    console.log('3. Admin account logged in on both devices');
    console.log('4. Backend server running with logs enabled');
    console.log('5. WhatsApp ready to trigger test orders');
    console.log('\nPress Enter to begin testing...');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    await new Promise(resolve => {
      rl.question('', resolve);
    });
    rl.close();

    // Test matrix
    const testMatrix = [
      {
        platform: 'Android',
        appState: 'Foreground',
        instructions: `
1. Open admin app and keep in foreground
2. Navigate to Orders screen
3. Start screen recording
4. Trigger new order via WhatsApp
5. Observe notification banner appearance
6. Tap notification and verify navigation`
      },
      {
        platform: 'Android', 
        appState: 'Background',
        instructions: `
1. Open admin app
2. Press home button to move to background
3. Start screen recording  
4. Trigger new order via WhatsApp
5. Observe notification in tray
6. Tap notification and verify app opens correctly`
      },
      {
        platform: 'Android',
        appState: 'Killed', 
        instructions: `
1. Force-close admin app from recent apps
2. Start screen recording
3. Trigger new order via WhatsApp
4. Observe notification in tray
5. Tap notification and verify app launches correctly`
      },
      {
        platform: 'iOS',
        appState: 'Foreground',
        instructions: `
1. Open admin app and keep in foreground
2. Navigate to Orders screen
3. Start screen recording
4. Trigger new order via WhatsApp
5. Observe notification banner
6. Tap notification and verify navigation`
      },
      {
        platform: 'iOS',
        appState: 'Background', 
        instructions: `
1. Open admin app
2. Press home button to move to background
3. Start screen recording
4. Trigger new order via WhatsApp
5. Observe notification in notification center
6. Tap notification and verify app opens correctly`
      },
      {
        platform: 'iOS',
        appState: 'Killed',
        instructions: `
1. Force-close admin app from app switcher
2. Start screen recording
3. Trigger new order via WhatsApp
4. Observe notification in notification center
5. Tap notification and verify app launches correctly`
      }
    ];

    // Execute each test
    for (const test of testMatrix) {
      await this.executeTest(test.platform, test.appState, test.instructions);
      
      // Wait between tests
      if (test !== testMatrix[testMatrix.length - 1]) {
        console.log('\n⏳ Waiting 30 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    // Generate final results
    console.log('\n' + '='.repeat(60));
    this.monitor.generateResultsTable();
    
    // Export results
    const resultsFile = path.join(this.evidenceDir, 'step4_results.json');
    this.monitor.exportResults(resultsFile);
    
    // Update execution results file
    this.updateExecutionResults();
    
    console.log('\n🏁 STEP 4 TESTING COMPLETE');
    console.log(`📁 Evidence saved to: ${this.evidenceDir}`);
    console.log(`📊 Results exported to: ${resultsFile}`);
  }

  updateExecutionResults() {
    const resultsFile = path.join(__dirname, 'STEP_4_EXECUTION_RESULTS.md');
    
    // This would update the markdown file with actual results
    // For now, just note that testing is complete
    const timestamp = new Date().toISOString();
    const update = `\n\n**TESTING COMPLETED:** ${timestamp}\n**RESULTS:** See step4_results.json`;
    
    fs.appendFileSync(resultsFile, update);
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  const executor = new Step4TestExecutor();
  executor.runFullTestMatrix().catch(console.error);
}

module.exports = Step4TestExecutor;
