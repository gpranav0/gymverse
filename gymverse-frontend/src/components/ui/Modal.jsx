import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export default function Modal({ isOpen, onClose, title, children }) {
  // Callers pass a fresh arrow function on every render. Reading it through a ref stops the
  // effect below from removing and re-adding its listener on each of those renders.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    // Only an open modal touches the page. Pages keep several closed modals mounted, and
    // each used to reset body overflow on every parent render, so the page behind an open
    // dialog could scroll.
    if (!isOpen) return undefined;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgb(3 5 10 / .62)', backdropFilter: 'blur(6px)', animation: 'fadeIn .2s both' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden text-ink"
        style={{ animation: 'var(--animate-screen-in)' }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="m-0 font-display text-[17px] font-semibold tracking-[-.2px]">{title}</h2>
          <button onClick={onClose} className="text-ink-muted transition-colors hover:text-ink" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
