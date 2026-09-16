import { Monogram } from './Glass';

/**
 * Generic glass data table.
 *
 * columns: [{
 *   key,            // used for React keys
 *   label,          // header text
 *   width,          // grid track, default minmax(0,1fr)
 *   mono,           // render value in DM Mono
 *   align,          // 'start' | 'end'
 *   render(row, i), // cell content
 * }]
 * rows, rowKey(row, i), footer (node), onRowClick (optional)
 */
export default function GlassTable({ columns, rows, rowKey, footer, onRowClick, emptyNote }) {
  const template = columns.map((c) => c.width || 'minmax(0,1fr)').join(' ');

  return (
    <div className="glass overflow-x-auto">
      <div className="min-w-[820px]">
        <div
          className="grid gap-3.5 border-b border-white/10 bg-white/4 px-[22px] py-3.5"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((c) => (
            <span key={c.key} className="label-caps" style={{ justifySelf: c.align === 'end' ? 'end' : 'start' }}>
              {c.label}
            </span>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="m-0 px-[22px] py-10 text-center text-sm text-ink-muted">{emptyNote}</p>
        ) : (
          rows.map((row, i) => (
            <div
              key={rowKey ? rowKey(row, i) : i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`grid items-center gap-3.5 border-b border-white/6 px-[22px] py-3.5 transition-colors hover:bg-white/6 ${onRowClick ? 'cursor-pointer' : ''}`}
              style={{
                gridTemplateColumns: template,
                animation: 'var(--animate-rise-in)',
                animationDelay: `${Math.min(i, 14) * 45}ms`,
              }}
            >
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={`min-w-0 ${c.mono ? 'font-mono text-[13px] text-ink-soft' : 'text-[13.5px] text-ink-soft'}`}
                  style={{ justifySelf: c.align === 'end' ? 'end' : 'stretch' }}
                >
                  {c.render(row, i)}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      {footer && <div className="px-[22px] py-3.5 text-[12.5px] text-ink-muted">{footer}</div>}
    </div>
  );
}

/** Two-line identity cell with a monogram — the usual first column. */
export function IdentityCell({ title, subtitle, index = 0 }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Monogram name={title || '?'} index={index} size={34} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{title}</div>
        {subtitle && <div className="truncate text-xs text-ink-muted">{subtitle}</div>}
      </div>
    </div>
  );
}
