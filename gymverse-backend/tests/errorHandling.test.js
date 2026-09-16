const { errorHandler } = require('../src/middleware/errorMiddleware');
const { notFound } = require('../src/middleware/notFoundMiddleware');
const { AppError, forbidden, conflict } = require('../src/utils/AppError');

const makeReq = () => ({ method: 'GET', originalUrl: '/api/test' });

const makeRes = (statusCode = 200) => {
  const res = { statusCode };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn(() => res);
  return res;
};

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('turns a bare 200 into a 500', () => {
    const res = makeRes(200);
    errorHandler(new Error('boom'), makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('preserves a status the controller already set', () => {
    const res = makeRes(403);
    errorHandler(new Error('nope'), makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('takes the status from an AppError over the response', () => {
    const res = makeRes(200);
    errorHandler(forbidden('not yours'), makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].message).toBe('not yours');
  });

  it('maps a unique violation to 409 without echoing the constraint name', () => {
    const res = makeRes(200);
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "uniq_x"'), { code: '23505' });
    errorHandler(pgError, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).not.toContain('uniq_x');
  });

  it('maps a check violation to 400', () => {
    const res = makeRes(200);
    const pgError = Object.assign(new Error('violates check constraint'), { code: '23514' });
    errorHandler(pgError, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps an invalid integer literal to 400', () => {
    const res = makeRes(200);
    const pgError = Object.assign(new Error('invalid input syntax for type integer'), { code: '22P02' });
    errorHandler(pgError, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('leaves an unrecognised pg code as a 500', () => {
    const res = makeRes(200);
    const pgError = Object.assign(new Error('something else'), { code: '99999' });
    errorHandler(pgError, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('withholds the stack trace when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    const res = makeRes(500);
    errorHandler(new Error('leaky'), makeReq(), res, jest.fn());
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('error');
  });

  it('withholds the stack trace in production', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes(500);
    errorHandler(new Error('leaky'), makeReq(), res, jest.fn());
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('error');
  });

  it('withholds the raw 500 message in production', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes(500);
    errorHandler(new Error('connect ECONNREFUSED 10.0.0.5:5432'), makeReq(), res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toBe('Internal Server Error');
  });

  it('still reports a 4xx message in production', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes(200);
    errorHandler(conflict('Member already has an active subscription'), makeReq(), res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toBe('Member already has an active subscription');
  });

  it('includes the stack trace only in development', () => {
    process.env.NODE_ENV = 'development';
    const res = makeRes(500);
    errorHandler(new Error('debuggable'), makeReq(), res, jest.fn());
    expect(res.json.mock.calls[0][0]).toHaveProperty('error');
  });
});

describe('AppError', () => {
  it('carries its status code', () => {
    expect(new AppError('x', 418).statusCode).toBe(418);
  });

  it('defaults to 500', () => {
    expect(new AppError('x').statusCode).toBe(500);
  });
});

describe('notFound', () => {
  it('forwards a 404 error naming the URL', () => {
    const res = makeRes();
    const next = jest.fn();
    notFound({ method: 'GET', originalUrl: '/api/nope' }, res, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('/api/nope');
  });
});
