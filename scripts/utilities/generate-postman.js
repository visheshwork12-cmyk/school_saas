// scripts/utilities/generate-postman.js

const fs = require('fs');
const YAML = require('yamljs');

/**
 * Generate Postman collection from OpenAPI spec
 */
const generatePostmanCollection = () => {
  const openApiSpec = YAML.load('./docs/api/openapi.yaml');
  
  const postmanCollection = {
    "info": {
      "name": "School Management System API",
      "description": "Complete API collection for SMS",
      "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "auth": {
      "type": "bearer",
      "bearer": [
        {
          "key": "token",
          "value": "{{access_token}}",
          "type": "string"
        }
      ]
    },
    "event": [
      {
        "listen": "prerequest",
        "script": {
          "exec": [
            "// Auto-refresh token if expired",
            "if (pm.globals.get('token_expires_at') < Date.now()) {",
            "  pm.sendRequest({",
            "    url: pm.globals.get('base_url') + '/auth/refresh',",
            "    method: 'POST',",
            "    header: {",
            "      'Content-Type': 'application/json'",
            "    },",
            "    body: {",
            "      mode: 'raw',",
            "      raw: JSON.stringify({",
            "        refreshToken: pm.globals.get('refresh_token')",
            "      })",
            "    }",
            "  }, function (err, res) {",
            "    if (!err && res.code === 200) {",
            "      const data = res.json().data;",
            "      pm.globals.set('access_token', data.accessToken);",
            "      pm.globals.set('token_expires_at', Date.now() + (data.expiresIn * 1000));",
            "    }",
            "  });",
            "}"
          ]
        }
      }
    ],
    "variable": [
      {
        "key": "base_url",
        "value": "http://localhost:3000/api/v1"
      },
      {
        "key": "school_id",
        "value": ""
      }
    ],
    "item": []
  };

  // Generate requests from OpenAPI paths
  Object.keys(openApiSpec.paths).forEach(path => {
    Object.keys(openApiSpec.paths[path]).forEach(method => {
      const operation = openApiSpec.paths[path][method];
      
      const request = {
        "name": operation.summary || `${method.toUpperCase()} ${path}`,
        "request": {
          "method": method.toUpperCase(),
          "header": [
            {
              "key": "Content-Type",
              "value": "application/json"
            }
          ],
          "url": {
            "raw": "{{base_url}}" + path,
            "host": ["{{base_url}}"],
            "path": path.split('/').filter(p => p)
          }
        }
      };

      // Add request body if present
      if (operation.requestBody) {
        request.request.body = {
          "mode": "raw",
          "raw": JSON.stringify({
            "// Add your request data here": ""
          })
        };
      }

      postmanCollection.item.push(request);
    });
  });

  // Save collection
  fs.writeFileSync(
    './docs/api/postman/platform-apis.json',
    JSON.stringify(postmanCollection, null, 2)
  );
};

generatePostmanCollection();
