const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const router = express.Router();

// Convert YAML to JSON and serve
router.get('/api-docs.json', (req, res) => {
  try {
    // Read existing OpenAPI YAML file
    const yamlPath = path.join(__dirname, '../../docs/api/openapi.yaml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    
    // Convert YAML to JSON
    const jsonContent = yaml.load(yamlContent);
    
    // Serve as JSON
    res.json(jsonContent);
  } catch (error) {
    console.error('Error loading API documentation:', error);
    res.status(500).json({ 
      error: 'Failed to load API documentation',
      message: error.message 
    });
  }
});

module.exports = router;
