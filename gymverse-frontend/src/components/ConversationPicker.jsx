import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, MessagesSquare } from 'lucide-react';

// A native <select> cannot be themed: Chrome and Edge on Windows draw its open list with
// the operating system's palette, so the menu flashed white against the dark glass UI.
// This is the same control built from the site's own surfaces. It follows the WAI-ARIA
// "select-only combobox" pattern, so keyboard and screen-reader use are unchanged.

const formatUpdated = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const ACCENT_RING = '0 0 0 4px color-mix(in oklab, var(--gv-accent) 22%, transparent)';

export default function ConversationPicker({
  conversations,
  disabled,
  onSelect,
  label = 'Saved conversations',
  placeholder = 'Load saved conversation',
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const optionId = (index) => `${listId}-option-${index}`;
  const last = Math.max(conversations.length - 1, 0);

  // Derived rather than synced in an effect: a picker that becomes disabled while a
  // conversation loads must not stay open over it.
  const isOpen = open && !disabled;

  useEffect(() => {
    if (!isOpen) return undefined;
    listRef.current?.focus();
    const closeOnOutsidePress = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) document.getElementById(`${listId}-option-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, active, listId]);

  const openAt = (index) => {
    if (disabled) return;
    setActive(Math.min(Math.max(index, 0), last));
    setOpen(true);
  };

  const close = ({ refocus = true } = {}) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const choose = (index) => {
    const item = conversations[index];
    if (!item) return;
    close();
    onSelect(item.id);
  };

  const onTriggerKeyDown = (event) => {
    if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openAt(0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); openAt(last); }
  };

  const onListKeyDown = (event) => {
    const moves = {
      ArrowDown: () => setActive((i) => Math.min(i + 1, last)),
      ArrowUp: () => setActive((i) => Math.max(i - 1, 0)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => close(),
    };
    if (event.key === 'Tab') { setOpen(false); return; }
    if (moves[event.key]) { event.preventDefault(); moves[event.key](); }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (isOpen ? close({ refocus: false }) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        className="field flex w-full items-center justify-between gap-2 py-2 text-left text-xs text-ink-soft hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-50"
        style={isOpen ? { borderColor: 'var(--gv-accent)', boxShadow: ACCENT_RING } : undefined}
      >
        <span className="truncate">{placeholder}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-ink-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={conversations.length ? optionId(active) : undefined}
          onKeyDown={onListKeyDown}
          onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false); }}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-60 overflow-y-auto rounded-xl border border-white/12 p-1.5 outline-none"
          style={{
            background: 'linear-gradient(155deg, rgb(24 34 56 / .98), rgb(9 13 24 / .98))',
            backdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
            boxShadow: '0 22px 48px -18px rgb(0 0 0 / .85), inset 0 1px 0 rgb(255 255 255 / .1)',
            animation: 'var(--animate-rise-in)',
          }}
        >
          {conversations.length === 0 ? (
            <li role="presentation" className="px-3 py-2.5 text-xs text-ink-muted">No saved conversations yet</li>
          ) : conversations.map((item, index) => {
            const highlighted = index === active;
            const updated = formatUpdated(item.updatedAt);
            return (
              <li
                key={item.id}
                id={optionId(index)}
                role="option"
                aria-selected={highlighted}
                // Keep focus on the listbox so a click doesn't blur-close it first.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors ${highlighted ? 'text-ink' : 'text-ink-soft'}`}
                style={highlighted ? {
                  background: 'color-mix(in oklab, var(--gv-accent) 20%, transparent)',
                  boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--gv-accent) 35%, transparent)',
                } : undefined}
              >
                <MessagesSquare size={14} aria-hidden="true" className={`shrink-0 ${highlighted ? 'text-primary' : 'text-ink-muted'}`} />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {updated && <span className="shrink-0 font-mono text-[10px] text-ink-muted">{updated}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
