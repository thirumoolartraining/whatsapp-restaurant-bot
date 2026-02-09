class SoundUtils {
  constructor() {
    this.audioContext = null;
    this.criticalAlertPlayed = new Set(); // Track order IDs that have played critical sound
    this.ownerEscalationPlayed = new Set(); // Track order IDs that have played owner escalation sound
    this.storageKeyCritical = 'criticalAlertsPlayed';
    this.storageKeyOwner = 'ownerEscalationPlayed';
    this.loadFromStorage();
  }

  // Load played alerts from localStorage
  loadFromStorage() {
    try {
      // Load critical alerts
      const storedCritical = localStorage.getItem(this.storageKeyCritical);
      if (storedCritical) {
        const data = JSON.parse(storedCritical);
        // Only keep alerts from last 24 hours to prevent storage bloat
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const validAlerts = data.filter(alert => alert.timestamp > oneDayAgo);
        this.criticalAlertPlayed = new Set(validAlerts.map(alert => alert.orderId));
        
        // Clean up old alerts
        if (validAlerts.length !== data.length) {
          this.saveToStorage();
        }
      }

      // Load owner escalation alerts
      const storedOwner = localStorage.getItem(this.storageKeyOwner);
      if (storedOwner) {
        const data = JSON.parse(storedOwner);
        // Only keep alerts from last 24 hours to prevent storage bloat
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const validAlerts = data.filter(alert => alert.timestamp > oneDayAgo);
        this.ownerEscalationPlayed = new Set(validAlerts.map(alert => alert.orderId));
        
        // Clean up old alerts
        if (validAlerts.length !== data.length) {
          this.saveToStorage();
        }
      }
    } catch (error) {
      console.error('[SoundUtils] Failed to load from storage:', error);
    }
  }

  // Save played alerts to localStorage
  saveToStorage() {
    try {
      // Save critical alerts
      const criticalData = Array.from(this.criticalAlertPlayed).map(orderId => ({
        orderId,
        timestamp: Date.now()
      }));
      localStorage.setItem(this.storageKeyCritical, JSON.stringify(criticalData));

      // Save owner escalation alerts
      const ownerData = Array.from(this.ownerEscalationPlayed).map(orderId => ({
        orderId,
        timestamp: Date.now()
      }));
      localStorage.setItem(this.storageKeyOwner, JSON.stringify(ownerData));
    } catch (error) {
      console.error('[SoundUtils] Failed to save to storage:', error);
    }
  }

  // Initialize audio context on user interaction
  initAudio() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (error) {
        console.error('[SoundUtils] Failed to initialize audio context:', error);
      }
    }
  }

  // Play a critical alert sound using Web Audio API
  playCriticalAlert(orderId) {
    // Check if we've already played sound for this order
    if (this.criticalAlertPlayed.has(orderId)) {
      return false;
    }

    // Initialize audio context if needed
    this.initAudio();
    
    if (!this.audioContext) {
      console.warn('[SoundUtils] Audio context not available');
      return false;
    }

    try {
      // Create a simple alert sound using oscillators
      const oscillator1 = this.audioContext.createOscillator();
      const oscillator2 = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      // Configure oscillators for alert sound
      oscillator1.frequency.setValueAtTime(800, this.audioContext.currentTime);
      oscillator2.frequency.setValueAtTime(1200, this.audioContext.currentTime);
      
      oscillator1.type = 'sine';
      oscillator2.type = 'sine';

      // Configure gain envelope for alert effect
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);

      // Connect nodes
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Play sound
      oscillator1.start(this.audioContext.currentTime);
      oscillator2.start(this.audioContext.currentTime);
      oscillator1.stop(this.audioContext.currentTime + 0.5);
      oscillator2.stop(this.audioContext.currentTime + 0.5);

      // Mark this order as having played the critical sound
      this.criticalAlertPlayed.add(orderId);
      this.saveToStorage();

      console.log(`[SoundUtils] Played critical alert for order ${orderId}`);
      return true;

    } catch (error) {
      console.error('[SoundUtils] Failed to play critical alert:', error);
      return false;
    }
  }

  // Play an owner escalation alert sound (more urgent than critical)
  playOwnerEscalationAlert(orderId) {
    // Check if we've already played sound for this order
    if (this.ownerEscalationPlayed.has(orderId)) {
      return false;
    }

    // Initialize audio context if needed
    this.initAudio();
    
    if (!this.audioContext) {
      console.warn('[SoundUtils] Audio context not available');
      return false;
    }

    try {
      // Create a more urgent escalation sound using multiple oscillators
      const oscillator1 = this.audioContext.createOscillator();
      const oscillator2 = this.audioContext.createOscillator();
      const oscillator3 = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      // Configure oscillators for urgent escalation sound
      oscillator1.frequency.setValueAtTime(600, this.audioContext.currentTime);
      oscillator2.frequency.setValueAtTime(900, this.audioContext.currentTime);
      oscillator3.frequency.setValueAtTime(1200, this.audioContext.currentTime);
      
      oscillator1.type = 'square';
      oscillator2.type = 'square';
      oscillator3.type = 'square';

      // Configure gain envelope for urgent escalation effect
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.4, this.audioContext.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0.2, this.audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0.4, this.audioContext.currentTime + 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.8);

      // Connect nodes
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      oscillator3.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Play sound with pattern for urgency
      oscillator1.start(this.audioContext.currentTime);
      oscillator2.start(this.audioContext.currentTime);
      oscillator3.start(this.audioContext.currentTime);
      oscillator1.stop(this.audioContext.currentTime + 0.8);
      oscillator2.stop(this.audioContext.currentTime + 0.8);
      oscillator3.stop(this.audioContext.currentTime + 0.8);

      // Mark this order as having played owner escalation sound
      this.ownerEscalationPlayed.add(orderId);
      this.saveToStorage();

      console.log(`[SoundUtils] Played owner escalation alert for order ${orderId}`);
      return true;

    } catch (error) {
      console.error('[SoundUtils] Failed to play owner escalation alert:', error);
      return false;
    }
  }

  // Reset critical alert played flag (for testing or manual reset)
  resetCriticalAlert(orderId) {
    this.criticalAlertPlayed.delete(orderId);
    this.saveToStorage();
  }

  // Clear all critical alert flags
  clearAllCriticalAlerts() {
    this.criticalAlertPlayed.clear();
    this.saveToStorage();
  }

  // Reset owner escalation alert played flag (for testing or manual reset)
  resetOwnerEscalationAlert(orderId) {
    this.ownerEscalationPlayed.delete(orderId);
    this.saveToStorage();
  }

  // Clear all owner escalation alert flags
  clearAllOwnerEscalationAlerts() {
    this.ownerEscalationPlayed.clear();
    this.saveToStorage();
  }

  // Check if critical alert has been played for an order
  hasPlayedCriticalAlert(orderId) {
    return this.criticalAlertPlayed.has(orderId);
  }

  // Check if owner escalation alert has been played for an order
  hasPlayedOwnerEscalationAlert(orderId) {
    return this.ownerEscalationPlayed.has(orderId);
  }
}

// Singleton instance
const soundUtils = new SoundUtils();

export default soundUtils;
