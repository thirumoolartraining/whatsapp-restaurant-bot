const express = require('express');
const groqAi = require('../services/groqAi');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const router = express.Router();

router.post('/generate-description', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, category } = req.body;
    const description = await groqAi.generateDescription(name, category);
    res.json({ description });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate-tags', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, category, foodType, quantity, unit } = req.body;
    const tags = await groqAi.generateTags(name, category, foodType, quantity, unit);
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
