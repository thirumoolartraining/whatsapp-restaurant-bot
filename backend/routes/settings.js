const express = require('express');
const Settings = require('../models/Settings');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const Logger = require('../services/logger');
const router = express.Router();

const logger = new Logger('settings');

// Get all settings (admin only)
router.get('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const settings = await Settings.find();
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    res.json(settingsObj);
  } catch (error) {
    logger.error('settings_fetch_failed', {
      errorCategory: 'domain',
      origin: 'settings',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Get a specific setting
router.get('/:key', async (req, res) => {
  try {
    const value = await Settings.getValue(req.params.key);
    res.json({ key: req.params.key, value });
  } catch (error) {
    logger.error('setting_fetch_failed', {
      errorCategory: 'domain',
      origin: 'settings',
      finality: 'terminal',
      key: req.params.key,
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Update a setting (admin only)
router.put('/:key', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { value } = req.body;
    const setting = await Settings.setValue(req.params.key, value, req.user?.username);
    res.json(setting);
  } catch (error) {
    logger.error('setting_update_failed', {
      errorCategory: 'domain',
      origin: 'settings',
      finality: 'terminal',
      key: req.params.key,
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Toggle holiday mode (admin only)
router.post('/holiday/toggle', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const currentValue = await Settings.getValue('holidayMode', false);
    const newValue = !currentValue;
    const setting = await Settings.setValue('holidayMode', newValue, req.user?.username);
    res.json({ holidayMode: newValue });
  } catch (error) {
    logger.error('holiday_mode_toggle_failed', {
      errorCategory: 'domain',
      origin: 'settings',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Get holiday mode status (public - for chatbot)
router.get('/holiday/status', async (req, res) => {
  try {
    const holidayMode = await Settings.getValue('holidayMode', false);
    res.json({ holidayMode });
  } catch (error) {
    logger.error('holiday_status_fetch_failed', {
      errorCategory: 'domain',
      origin: 'settings',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
