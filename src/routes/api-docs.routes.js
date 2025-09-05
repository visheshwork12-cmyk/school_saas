import { Router } from 'express';
import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const router = Router();

// __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Convert YAML to JSON and serve
router.get("/api-docs.json", (req, res) => {
  try {
    // Read existing OpenAPI YAML file
    const yamlPath = path.join(__dirname, "../../docs/api/openapi.yaml");
    const yamlContent = fs.readFileSync(yamlPath, "utf8");

    // Convert YAML to JSON
    const jsonContent = yaml.load(yamlContent);

    // Serve as JSON
    res.json(jsonContent);
  } catch (error) {
    console.error("Error loading API documentation:", error);
    res.status(500).json({
      error: "Failed to load API documentation",
      message: error.message,
    });
  }
});

export default router;
