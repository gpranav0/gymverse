import { Skeleton } from './Glass';

/** Page-level error note. */
export function ErrorNote({ children }) {
  return (
    <div
      className="rounded-[18px] px-5 py-4 text-sm text-[#ffc2cc]"
      style={{
        background: 'rgb(251 113 133 / .12)',
        border: '1px solid rgb(251 113 133 / .34)',
        backdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
        WebkitBackdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
        animation: 'var(--animate-rise-in)',
      }}
    >
      {children}
    </div>
  );
}

/** Empty state on glass. */
export function EmptyState({ children }) {
  return (
    <div className="glass px-6 py-12 text-center" style={{ animation: 'var(--animate-rise-in)' }}>
      <p className="m-0 text-sm text-ink-muted">{children}</p>
    </div>
  );
}

/** Shimmer placeholder for a card grid. */
export function LoadingCards({ count = 6, height = 210 }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(272px,1fr))]">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} height={height} />)}
    </div>
  );
}

/** Shimmer placeholder for a table. */
export function LoadingTable({ rows = 6 }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton height={52} />
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} height={62} />)}
    </div>
  );
}

/** Page header: title + optional right-hand controls. */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 font-display text-[26px] font-bold tracking-[-.7px]">{title}</h1>
        {subtitle && <p className="m-0 mt-1 text-[13.5px] text-ink-soft">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

/** Glass search field with icon. */
export function SearchField({ value, onChange, placeholder, icon: Icon, width = 260 }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/13 bg-white/5 px-3.5 py-2.5" style={{ width }}>
      {Icon && <Icon size={16} className="shrink-0 text-ink-muted" />}
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border-none bg-transparent text-sm text-ink outline-none"
      />
    </div>
  );
}

/** Page-level success note, used instead of a blocking alert(). */
export function SuccessNote({ children, onDismiss }) {
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-[18px] px-5 py-4 text-sm text-[#8ff0cd]"
      style={{
        background: 'rgb(52 211 153 / .12)',
        border: '1px solid rgb(52 211 153 / .34)',
        backdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
        WebkitBackdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
        animation: 'var(--animate-rise-in)',
      }}
    >
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 leading-none opacity-80 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}
