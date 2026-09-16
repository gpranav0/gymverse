import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Page controls for the list views. `meta` is the { page, limit, total, totalPages }
 * object every paginated endpoint returns.
 */
export default function Pagination({ meta, onPageChange, disabled = false }) {
  if (!meta || meta.totalPages <= 1) return null;

  const { page, limit, total, totalPages } = meta;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/8 px-[22px] py-3.5">
      <p className="m-0 text-[12.5px] text-ink-muted">
        Showing <span className="font-mono text-ink-soft">{first}</span>–
        <span className="font-mono text-ink-soft">{last}</span> of{' '}
        <span className="font-mono text-ink-soft">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost flex items-center gap-1 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          <ChevronLeft size={15} />
          Previous
        </button>
        <span className="px-1 font-mono text-[12px] text-ink-muted">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn-ghost flex items-center gap-1 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
        >
          Next
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
