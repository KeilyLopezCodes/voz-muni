import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer } from '../../src/container';

describe('GET /health', () => {
  it('responde 200 con status ok y timestamp ISO UTC', async () => {
    const res = await request(createApp(buildContainer())).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
