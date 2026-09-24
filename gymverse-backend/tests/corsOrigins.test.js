const { expandDevelopmentOrigins } = require('../src/config/corsOrigins');

test('allows both loopback names for the same development port', () => {
  expect(expandDevelopmentOrigins(['http://localhost:5173'], 'development'))
    .toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
});

test('keeps the production allowlist exact', () => {
  expect(expandDevelopmentOrigins(['http://localhost:5173'], 'production'))
    .toEqual(['http://localhost:5173']);
});

test('does not broaden non-loopback origins', () => {
  expect(expandDevelopmentOrigins(['https://gymverse.example'], 'development'))
    .toEqual(['https://gymverse.example']);
});
