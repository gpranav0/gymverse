const { buildUpdate, buildReplace } = require('../src/utils/updateBuilder');

describe('buildUpdate', () => {
  const FIELDS = ['member_name', 'phone', 'status'];

  it('only emits the fields that were supplied', () => {
    const { text, params } = buildUpdate('members', 'member_id', 7, FIELDS, { phone: '555' });
    expect(text).toBe('UPDATE members SET phone = $1 WHERE member_id = $2 RETURNING *');
    expect(params).toEqual(['555', 7]);
  });

  it('numbers placeholders in order across several fields', () => {
    const { text, params } = buildUpdate('members', 'member_id', 7, FIELDS, {
      member_name: 'Ada', phone: '555', status: 'active'
    });
    expect(text).toBe(
      'UPDATE members SET member_name = $1, phone = $2, status = $3 WHERE member_id = $4 RETURNING *'
    );
    expect(params).toEqual(['Ada', '555', 'active', 7]);
  });

  // The whole point of the whitelist: a caller cannot introduce a column.
  it('ignores keys that are not in the allowed list', () => {
    const { text, params } = buildUpdate('members', 'member_id', 7, FIELDS, {
      phone: '555', password_hash: 'pwned', member_id: 999
    });
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('member_id = $2,');
    expect(params).toEqual(['555', 7]);
  });

  it('honours the skip list, which is how status is withheld from non-staff', () => {
    const { text, params } = buildUpdate(
      'members', 'member_id', 7, FIELDS,
      { phone: '555', status: 'active' },
      { skip: ['status'] }
    );
    expect(text).not.toContain('status');
    expect(params).toEqual(['555', 7]);
  });

  it('rejects an update with nothing to set', () => {
    expect(() => buildUpdate('members', 'member_id', 7, FIELDS, {}))
      .toThrow(/No valid fields/);
  });

  it('rejects an update whose only field was skipped', () => {
    expect(() => buildUpdate('members', 'member_id', 7, FIELDS, { status: 'active' }, { skip: ['status'] }))
      .toThrow(/No valid fields/);
  });

  // null is a real value a caller may want to write; undefined means "not supplied".
  it('treats an explicit null as a value to write', () => {
    const { params } = buildUpdate('members', 'member_id', 7, FIELDS, { phone: null });
    expect(params).toEqual([null, 7]);
  });
});

describe('buildReplace', () => {
  const REQUIRED = ['member_name', 'phone'];
  const OPTIONAL = ['address', 'status'];

  it('accepts a body carrying every required field', () => {
    const { text, params } = buildReplace('members', 'member_id', 7, REQUIRED, OPTIONAL, {
      member_name: 'Ada', phone: '555', address: 'Somewhere'
    });
    expect(text).toContain('member_name = $1');
    expect(params).toEqual(['Ada', '555', 'Somewhere', 7]);
  });

  // The bug this exists to prevent: a PUT missing `address` used to write NULL over it.
  it('rejects a partial PUT rather than nulling the omitted columns', () => {
    expect(() => buildReplace('members', 'member_id', 7, REQUIRED, OPTIONAL, { member_name: 'Ada' }))
      .toThrow(/required/);
  });

  it('names the missing fields and points at PATCH', () => {
    expect(() => buildReplace('members', 'member_id', 7, REQUIRED, OPTIONAL, {}))
      .toThrow(/member_name, phone.*PATCH/s);
  });

  it('treats an empty string as missing', () => {
    expect(() => buildReplace('members', 'member_id', 7, REQUIRED, OPTIONAL, { member_name: 'Ada', phone: '' }))
      .toThrow(/phone/);
  });

  it('treats an explicit null as missing', () => {
    expect(() => buildReplace('members', 'member_id', 7, REQUIRED, OPTIONAL, { member_name: 'Ada', phone: null }))
      .toThrow(/phone/);
  });

  it('still applies the skip list', () => {
    const { text } = buildReplace(
      'members', 'member_id', 7, REQUIRED, OPTIONAL,
      { member_name: 'Ada', phone: '555', status: 'suspended' },
      { skip: ['status'] }
    );
    expect(text).not.toContain('status');
  });
});
