const request = require('supertest');

jest.mock('../../src/config/database', () => ({
  $connect: jest.fn().mockResolvedValue(undefined),
  $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
  $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: 1 }]),
  user: {
    findUnique: jest.fn(),
  },
}));

jest.mock('../../src/redisClient', () => ({
  ping: jest.fn().mockResolvedValue('PONG'),
  call: jest.fn().mockResolvedValue('OK'),
}));

jest.mock('../../src/config/bullBoard', () => {
  const express = require('express');
  return {
    serverAdapter: {
      getRouter: () => express.Router(),
    },
  };
});

describe('Health API', () => {
  test('GET /api/health returns service status', async () => {
    const { app } = require('../../src/server');

    const response = await request(app).get('/api/health');

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'connected',
      redis: 'connected',
    });
  });
});
