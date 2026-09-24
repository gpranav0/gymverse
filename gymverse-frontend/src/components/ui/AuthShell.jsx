import { Dumbbell, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGlassTheme } from './Glass';

/** The glass card used by every signed-out page (sign in, register, password, email). */
export default function AuthShell({ title, subtitle, maxWidth = 420, children }) {
  useGlassTheme({ accent: '#c7ff35', blur: 12 });

  return (
    <div className="auth-layout">
      <div className="auth-showcase"><Link to="/" className="auth-showcase-logo"><Dumbbell size={22} /> GYMVERSE<span>.</span></Link><div><p>THE WORK STARTS HERE</p><h2>EVERY REP.<br />EVERY MILE.<br /><em>EVERY DAY.</em></h2><span>More than a membership. A place to find your momentum.</span></div></div>
      <div className="auth-form-side"><Link to="/" className="auth-back-home">Back to the club <ArrowUpRight size={16} /></Link><div className="auth-form-wrap" style={{ maxWidth }}><div className="auth-mobile-brand"><Dumbbell size={21} /> GYMVERSE<span>.</span></div><p className="landing-eyebrow">WELCOME TO GYMVERSE</p><h1>{title}</h1>{subtitle && <p className="auth-subtitle">{subtitle}</p>}{children}</div></div>
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
