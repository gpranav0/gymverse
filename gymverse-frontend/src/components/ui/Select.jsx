import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// Drop-in replacement for a single-choice <select>. A native select cannot be themed: Chrome
// and Edge on Windows draw its open list with the operating system's palette, so every menu
// flashed white against the dark glass UI (see ConversationPicker for the same fix).
//
// Usage is unchanged: <Select name value onChange required>{<option>s}</Select>. onChange
// receives an event-like object with target.name / target.value, as the forms expect.
//
// It follows the WAI-ARIA "select-only combobox" pattern. The list renders in a portal
// because most selects live inside Modal, whose scrolling body would clip it.

const ACCENT_RING = '0 0 0 4px color-mix(in oklab, var(--gv-accent) 22%, transparent)';
const DANGER_RING = '0 0 0 4px rgb(251 113 133 / .2)';
const LIST_GAP = 6;
const LIST_MAX_HEIGHT = 260;

// <option> children can arrive nested in arrays and fragments, alongside false/null from
// conditionals. Flatten them to plain { value, label, disabled } records.
function readOptions(children) {
  const options = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === 'option') {
      const { value, children: label, disabled } = child.props;
      const text = Children.toArray(label).join('');
      options.push({ value: String(value ?? text), label: text, disabled: Boolean(disabled) });
    } else if (child.props?.children) {
      options.push(...readOptions(child.props.children));
    }
  });
  return options;
}

// When a form with several empty required selects is submitted, each one fires `invalid`.
// Only the first (in document order) should take focus, as the browser does natively.
let focusClaimed = false;

export default function Select({
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  children,
  'aria-label': ariaLabel,
  ...rest
}) {
  const options = readOptions(children);
  const current = value == null ? '' : String(value);
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = options[selectedIndex];
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const typeahead = useRef({ text: '', timer: 0 });
  const listId = useId();
  const optionId = (index) => `${listId}-option-${index}`;

  const isOpen = open && !disabled;
  const showInvalid = invalid && current === '';

  const commit = (index) => {
    const option = options[index];
    if (!option || option.disabled) return;
    setInvalid(false);
    if (option.value !== current) {
      const target = { name, value: option.value, type: 'select-one' };
      onChange?.({ target, currentTarget: target, type: 'change', preventDefault() {}, stopPropagation() {} });
    }
  };

  const openList = (preferred = selectedIndex) => {
    if (disabled) return;
    const start = options[preferred] && !options[preferred].disabled ? preferred : enabled[0] ?? -1;
    setActive(start);
    setOpen(true);
  };

  const close = ({ refocus = true } = {}) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const step = (from, delta) => {
    if (!enabled.length) return -1;
    const pos = enabled.indexOf(from);
    if (pos === -1) return delta > 0 ? enabled[0] : enabled[enabled.length - 1];
    return enabled[Math.min(Math.max(pos + delta, 0), enabled.length - 1)];
  };

  // Typing jumps to the next option starting with the typed text, like a native select.
  const findByTyping = (key, from) => {
    const state = typeahead.current;
    clearTimeout(state.timer);
    state.text += key.toLowerCase();
    state.timer = setTimeout(() => { state.text = ''; }, 600);
    // Pressing one letter repeatedly cycles through its matches; a longer word refines the
    // current match, so the search then starts at the current option instead of after it.
    const cycling = [...state.text].every((c) => c === state.text[0]);
    const query = cycling ? state.text[0] : state.text;
    const firstAfter = cycling ? from + 1 : from;
    const order = [...enabled.filter((i) => i >= firstAfter), ...enabled.filter((i) => i < firstAfter)];
    return order.find((i) => options[i].label.toLowerCase().startsWith(query)) ?? -1;
  };

  const isTypeaheadKey = (event) => event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey;

  const onTriggerKeyDown = (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openList();
    } else if (isTypeaheadKey(event)) {
      const match = findByTyping(event.key, selectedIndex);
      if (match >= 0) commit(match);
    }
  };

  const onListKeyDown = (event) => {
    const moves = {
      ArrowDown: () => setActive((i) => step(i, 1)),
      ArrowUp: () => setActive((i) => step(i, -1)),
      Home: () => setActive(enabled[0] ?? -1),
      End: () => setActive(enabled[enabled.length - 1] ?? -1),
      PageDown: () => setActive((i) => step(i, 8)),
      PageUp: () => setActive((i) => step(i, -8)),
      Enter: () => { commit(active); close(); },
      ' ': () => { commit(active); close(); },
      // Handled here, so Modal's document-level Escape listener must leave the dialog open.
      Escape: () => close(),
    };
    if (event.key === 'Tab') { setOpen(false); return; }
    if (moves[event.key]) {
      event.preventDefault();
      event.stopPropagation();
      moves[event.key]();
    } else if (isTypeaheadKey(event)) {
      const match = findByTyping(event.key, active);
      if (match >= 0) setActive(match);
    }
  };

  // Place the list under the trigger, or above it when there is more room there, and keep
  // it attached while the modal body or the page scrolls.
  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - LIST_GAP - 8;
      const above = rect.top - LIST_GAP - 8;
      const upward = below < Math.min(LIST_MAX_HEIGHT, 160) && above > below;
      setPosition({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(LIST_MAX_HEIGHT, upward ? above : below)),
        ...(upward ? { bottom: window.innerHeight - rect.top + LIST_GAP } : { top: rect.bottom + LIST_GAP }),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!rootRef.current?.contains(event.target) && !listRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [isOpen]);

  // The list mounts one render after opening (once it has a position), so focus it on mount.
  const attachList = (node) => {
    listRef.current = node;
    node?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (isOpen && active >= 0) document.getElementById(`${listId}-option-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, active, position, listId]);

  useEffect(() => () => clearTimeout(typeahead.current.timer), []);

  // The browser's own "please select an item" bubble would point at the hidden input, so it
  // is replaced by the field's themed error state.
  const onInvalid = (event) => {
    event.preventDefault();
    setInvalid(true);
    if (!focusClaimed) {
      focusClaimed = true;
      buttonRef.current?.focus();
      setTimeout(() => { focusClaimed = false; });
    }
  };

  const ring = showInvalid ? DANGER_RING : isOpen ? ACCENT_RING : undefined;

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-col">
      <button
        {...rest}
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-invalid={showInvalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (isOpen ? close({ refocus: false }) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={`field flex w-full cursor-pointer items-center justify-between gap-2 text-left hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        style={{
          ...(ring && { boxShadow: ring }),
          ...(showInvalid ? { borderColor: 'var(--color-danger)' } : isOpen ? { borderColor: 'var(--gv-accent)' } : null),
        }}
      >
        {/* Every label shares one grid cell, so the trigger is as wide as its longest option
            (like a native select) and does not change width as the choice changes. */}
        <span className="grid min-w-0">
          {options.map((o, i) => (
            <span key={i} aria-hidden="true" className="invisible col-start-1 row-start-1 truncate">{o.label}</span>
          ))}
          <span className={`col-start-1 row-start-1 truncate ${!selected || selected.disabled ? 'text-ink-muted' : 'text-ink'}`}>
            {selected?.label ?? ' '}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-ink-muted transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}
        />
      </button>

      {/* Takes part in native form validation and FormData; never focused or seen. */}
      <input
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={current}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={onInvalid}
        className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
      />
      {showInvalid && <span role="alert" className="mt-1.5 text-xs text-danger">Please choose an option.</span>}

      {isOpen && position && createPortal(
        <ul
          ref={attachList}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          onKeyDown={onListKeyDown}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget) && !listRef.current?.contains(event.relatedTarget)) setOpen(false);
          }}
          className="fixed z-[70] m-0 list-none overflow-y-auto rounded-xl border border-white/12 p-1.5 text-sm text-ink outline-none"
          style={{
            left: position.left,
            top: position.top,
            bottom: position.bottom,
            minWidth: position.width,
            maxWidth: `max(${position.width}px, min(28rem, calc(100vw - ${position.left + 12}px)))`,
            maxHeight: position.maxHeight,
            background: 'linear-gradient(155deg, rgb(24 34 56 / .98), rgb(9 13 24 / .98))',
            backdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
            WebkitBackdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
            boxShadow: '0 22px 48px -18px rgb(0 0 0 / .85), inset 0 1px 0 rgb(255 255 255 / .1)',
            animation: 'fadeIn .14s both',
          }}
        >
          {options.length === 0 ? (
            <li role="presentation" className="px-3 py-2.5 text-ink-muted">No options</li>
          ) : options.map((option, index) => {
            const highlighted = index === active;
            const isSelected = index === selectedIndex;
            return (
              <li
                key={`${option.value}-${index}`}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                // Keep focus on the listbox so a click doesn't blur-close it first.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => { if (!option.disabled) setActive(index); }}
                onClick={() => { if (!option.disabled) { commit(index); close(); } }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                  option.disabled ? 'cursor-default text-ink-muted/70' : `cursor-pointer ${highlighted || isSelected ? 'text-ink' : 'text-ink-soft'}`
                }`}
                style={highlighted && !option.disabled ? {
                  background: 'color-mix(in oklab, var(--gv-accent) 20%, transparent)',
                  boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--gv-accent) 35%, transparent)',
                } : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <Check size={14} aria-hidden="true" className={`shrink-0 text-primary ${isSelected && !option.disabled ? '' : 'invisible'}`} />
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
