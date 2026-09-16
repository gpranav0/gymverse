import { Dumbbell } from 'lucide-react';
import AppBackdrop from './AppBackdrop';
import { useGlassTheme } from './Glass';

/** The glass card used by every signed-out page (sign in, register, password, email). */
export default function AuthShell({ title, subtitle, maxWidth = 420, children }) {
  useGlassTheme({ accent: '#4d8dff', blur: 18 });

  return (
    <div className="relative grid min-h-screen place-items-center px-6 py-10 text-ink">
      <AppBackdrop />
      <div className="glass w-full px-8 py-9" style={{ maxWidth, animation: 'var(--animate-screen-in)' }}>
        <div className="mb-7 flex items-center gap-2.5">
          <div
            className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
            style={{
              background: 'linear-gradient(150deg, var(--gv-accent), #7c5cff)',
              boxShadow: '0 8px 22px -8px var(--gv-accent)',
            }}
          >
            <Dumbbell size={19} color="#fff" />
          </div>
          <span className="font-display text-[19px] font-bold tracking-[-.2px]">GymVerse</span>
        </div>

        <h1 className="m-0 mb-1.5 font-display text-[27px] font-bold tracking-[-.6px]">{title}</h1>
        {subtitle && <p className="m-0 mb-6.5 text-sm text-ink-soft">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

const TONES = {
  error: ['rgb(251 113 133 / .14)', 'rgb(251 113 133 / .36)', '#ffc2cc'],
  success: ['rgb(52 211 153 / .14)', 'rgb(52 211 153 / .36)', '#8ff0cd'],
};

/** Inline message inside an AuthShell card. */
export function AuthAlert({ tone = 'error', children }) {
  const [bg, border, color] = TONES[tone] || TONES.error;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="mb-4 rounded-xl px-4 py-3 text-[13px]"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      {children}
    </div>
  );
}
