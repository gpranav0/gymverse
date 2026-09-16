const { getPagination, buildMeta } = require('../src/utils/pagination');

const req = (query) => ({ query });

describe('getPagination', () => {
  it('defaults to page 1 with a 20-row limit', () => {
    expect(getPagination(req({}))).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('computes the offset from page and limit', () => {
    expect(getPagination(req({ page: '3', limit: '10' }))).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('caps the limit so one request cannot dump an entire table', () => {
    expect(getPagination(req({ limit: '999999' })).limit).toBe(1000);
    expect(getPagination(req({ limit: '500' }), { maxLimit: 100 }).limit).toBe(100);
  });

  it('rejects non-positive and non-numeric pages instead of producing a negative OFFSET', () => {
    for (const page of ['0', '-5', 'abc', '']) {
      const result = getPagination(req({ page }));
      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    }
  });

  it('falls back to the default limit for junk values', () => {
    expect(getPagination(req({ limit: '-1' })).limit).toBe(20);
    expect(getPagination(req({ limit: 'ten' })).limit).toBe(20);
    expect(getPagination(req({}), { defaultLimit: 50 }).limit).toBe(50);
  });
});

describe('buildMeta', () => {
  it('reports the page count', () => {
    expect(buildMeta(2, 20, 45)).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
  });

  it('reports zero pages for an empty table rather than NaN', () => {
    expect(buildMeta(1, 20, 0).totalPages).toBe(0);
  });
});
