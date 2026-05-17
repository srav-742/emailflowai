const { errorHandler } = require('../../src/middleware/errorHandler');

describe('errorHandler', () => {
  test('returns normalized JSON error responses', () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/test',
    };
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();
    const error = Object.assign(new Error('Forbidden'), { status: 403 });

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Forbidden',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
