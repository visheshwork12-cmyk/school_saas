// tests/documentation/api-docs.test.js

const request = require('supertest');
const app = require('../../src/app');

describe('API Documentation', () => {
  
  test('Swagger UI should be accessible', async () => {
    const response = await request(app)
      .get('/api-docs')
      .expect(200);
      
    expect(response.text).toContain('swagger-ui');
  });

  test('OpenAPI JSON should be valid', async () => {
    const response = await request(app)
      .get('/api-docs.json')
      .expect(200);
      
    expect(response.body).toHaveProperty('openapi');
    expect(response.body).toHaveProperty('info');
    expect(response.body).toHaveProperty('paths');
  });

  test('ReDoc should be accessible', async () => {
    const response = await request(app)
      .get('/docs')
      .expect(200);
      
    expect(response.text).toContain('redoc');
  });
});
