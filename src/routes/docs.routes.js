// src/routes/docs.routes.js
import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsPath = path.join(__dirname, '../../docs');

// Serve markdown files as HTML
router.get('/docs/:category/:file?', async (req, res) => {
  try {
    const { category, file } = req.params;
    const filePath = file 
      ? path.join(docsPath, category, `${file}.md`)
      : path.join(docsPath, category, 'index.md');
    
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Convert markdown to HTML (you can use a library like marked)
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>${file || category} - Documentation</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    pre { background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; }
    code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
  <nav>
    <a href="/api-docs">← Back to API Docs</a> | 
    <a href="/docs/architecture/system-design">Architecture</a> |
    <a href="/docs/api/examples">API Examples</a>
  </nav>
  <hr>
  <pre>${content}</pre>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error) {
    res.status(404).json({ error: 'Documentation not found' });
  }
});

export default router;
