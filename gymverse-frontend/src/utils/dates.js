// The local calendar day of a moment, as YYYY-MM-DD. `toISOString()` is UTC: late in the
// evening east of Greenwich it already says tomorrow.
export const toLocalDay = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Date inputs and "today" defaults need the local calendar date.
export const todayLocal = () => toLocalDay(new Date());

// DATE columns arrive as 'YYYY-MM-DD', and `new Date('2026-09-14')` is UTC midnight, which
// west of Greenwich is still the 13th. Calendar days are built from their parts instead.
export const parseDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
};

export const fmtDate = (value) => (value ? parseDate(value).toLocaleDateString() : '—');

export const fmtTime = (value) => (value ? String(value).slice(0, 5) : '—');
