const { asyncHandler } = require('../../src/utils/asyncHandler');

describe('asyncHandler', () => {
  test('forwards rejected async errors to next()', async () => {
    const req = {};
    const res = {};
    const next = jest.fn();
    const error = new Error('Boom');

    const wrapped = asyncHandler(async () => {
      throw error;
    });

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
