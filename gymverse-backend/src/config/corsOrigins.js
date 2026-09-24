/** Treat localhost and 127.0.0.1 as the same Vite development host. */
function expandDevelopmentOrigins(origins, nodeEnv) {
  if (nodeEnv === 'production') return origins;
  const expanded = new Set(origins);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') continue;
      const alias = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      expanded.add(`${url.protocol}//${alias}${url.port ? `:${url.port}` : ''}`);
    } catch {
      // Leave malformed values to the regular CORS check: they will not match a request.
    }
  }
  return [...expanded];
}

module.exports = { expandDevelopmentOrigins };
