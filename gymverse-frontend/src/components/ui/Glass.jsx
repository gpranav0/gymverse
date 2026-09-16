import { useEffect, useRef, useState } from 'react';

/** Glass surface with optional entrance stagger. */
export function GlassPanel({ as: Tag = 'div', delay = 0, hover = false, className = '', style, children, ...rest }) {
  return (
    <Tag
      className={`glass ${hover ? 'glass-hover' : ''} ${className}`}
      style={{ animation: 'var(--animate-rise-in)', animationDelay: `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

const PILL = {
  active: ['rgb(52 211 153 / .16)', 'rgb(52 211 153 / .4)', '#8ff0cd'],
  available: ['rgb(52 211 153 / .16)', 'rgb(52 211 153 / .4)', '#8ff0cd'],
  paid: ['rgb(52 211 153 / .16)', 'rgb(52 211 153 / .4)', '#8ff0cd'],
  'on floor': ['rgb(77 141 255 / .18)', 'rgb(77 141 255 / .42)', '#bcd6ff'],
  'in session': ['rgb(77 141 255 / .18)', 'rgb(77 141 255 / .42)', '#bcd6ff'],
  expiring: ['rgb(251 191 36 / .16)', 'rgb(251 191 36 / .42)', '#ffdf9e'],
  pending: ['rgb(251 191 36 / .16)', 'rgb(251 191 36 / .42)', '#ffdf9e'],
  paused: ['rgb(251 191 36 / .14)', 'rgb(251 191 36 / .36)', '#ffe2ab'],
  expired: ['rgb(251 113 133 / .16)', 'rgb(251 113 133 / .42)', '#ffc2cc'],
  failed: ['rgb(251 113 133 / .16)', 'rgb(251 113 133 / .42)', '#ffc2cc'],
  refunded: ['rgb(167 139 250 / .16)', 'rgb(167 139 250 / .42)', '#d8ccff'],
  neutral: ['rgb(255 255 255 / .07)', 'rgb(255 255 255 / .15)', '#cfd8e8'],
};

/** Status pill. Tinted border + light text keeps AA contrast on dark glass. */
export function Pill({ status = 'neutral', children }) {
  const [bg, bd, fg] = PILL[String(status).toLowerCase()] || PILL.neutral;
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 font-mono text-[11.5px] font-medium whitespace-nowrap"
      style={{ background: bg, border: `1px solid ${bd}`, color: fg }}
    >
      {children ?? status}
    </span>
  );
}

/** Shimmering skeleton block, used while data loads. */
export function Skeleton({ className = '', height = 112 }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[20px] border border-white/8 bg-white/[.045] ${className}`}
      style={{ height }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / .13), transparent)',
          animation: 'shimmer 1.25s linear infinite',
        }}
      />
    </div>
  );
}

/** Left-to-right growing progress bar. */
export function ProgressBar({ value = 0, delay = 0, fill = 'linear-gradient(90deg, var(--gv-accent), #8ab6ff)' }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/8">
      <div
        className="h-full origin-left rounded-full"
        style={{ width: `${value}%`, background: fill, animation: 'var(--animate-grow-width)', animationDelay: `${delay}ms` }}
      />
    </div>
  );
}

/** Circle avatar/monogram with a stable per-index hue. */
export function Monogram({ name = '', index = 0, size = 36, radius = 11 }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const h = [214, 162, 268, 32, 340, 190][index % 6];
  return (
    <div
      className="grid shrink-0 place-items-center font-display font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.36,
        background: `linear-gradient(150deg, hsl(${h} 70% 58% / .5), hsl(${(h + 40) % 360} 70% 48% / .28))`,
        border: '1px solid rgb(255 255 255 / .14)',
      }}
    >
      {initials}
    </div>
  );
}

/** Eased count-up. Returns the animated number; restarts whenever `to` changes. */
export function useCountUp(to = 0, duration = 1000) {
  const [n, setN] = useState(0);
  const raf = useRef();
  useEffect(() => {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [to, duration]);
  return n;
}

/** Applies the runtime glass knobs (accent colour, blur radius) to :root. */
export function useGlassTheme({ accent = '#4d8dff', blur = 18 } = {}) {
  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty('--gv-accent', accent);
    s.setProperty('--gv-blur', `${blur}px`);
  }, [accent, blur]);
}
