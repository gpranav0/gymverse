import { GlassPanel, useCountUp } from './Glass';

const GLOWS = {
  blue: 'radial-gradient(circle, rgb(77 141 255 / .85), transparent 68%)',
  green: 'radial-gradient(circle, rgb(52 211 153 / .8), transparent 68%)',
  violet: 'radial-gradient(circle, rgb(167 139 250 / .8), transparent 68%)',
  amber: 'radial-gradient(circle, rgb(251 191 36 / .75), transparent 68%)',
};
const TINTS = { blue: '#9ec2ff', green: '#8ff0cd', violet: '#d8ccff', amber: '#ffdf9e' };
const TRENDS = {
  up: ['rgb(52 211 153 / .16)', 'rgb(52 211 153 / .4)', '#8ff0cd'],
  warn: ['rgb(251 191 36 / .16)', 'rgb(251 191 36 / .42)', '#ffdf9e'],
  flat: ['rgb(255 255 255 / .07)', 'rgb(255 255 255 / .16)', '#cfd8e8'],
};

/**
 * Glass KPI tile. Drop-in replacement for the old StatCard.
 *   title, value, icon  — same as before
 *   count               — numeric target; animates 0 → count instead of printing `value`
 *   prefix              — e.g. "$" for money
 *   tone                — blue | green | violet | amber
 *   trend, note, trendTone — small caption row under the number
 */
export default function StatCard({
  title,
  value,
  count,
  prefix = '',
  icon: Icon,
  tone = 'blue',
  trend,
  note,
  trendTone = 'up',
  delay = 0,
}) {
  const animated = useCountUp(typeof count === 'number' ? count : 0);
  const shown = typeof count === 'number' ? prefix + animated.toLocaleString('en-US') : value;
  const [tBg, tBd, tFg] = TRENDS[trendTone] || TRENDS.up;

  return (
    <GlassPanel delay={delay} className="relative overflow-hidden px-5 py-[18px]">
      <div
        className="absolute -top-8 -right-8 h-28 w-28 rounded-full opacity-50 blur-[26px]"
        style={{ background: GLOWS[tone] }}
      />
      <div className="relative mb-3.5 flex items-center justify-between gap-2.5">
        <span className="label-caps">{title}</span>
        {Icon && (
          <div
            className="grid h-8 w-8 place-items-center rounded-[10px] border border-white/15 bg-white/6"
            style={{ color: TINTS[tone] }}
          >
            <Icon size={17} />
          </div>
        )}
      </div>
      <div className="relative font-display text-[34px] leading-none font-bold tracking-[-1.2px]">{shown}</div>
      {(trend || note) && (
        <div className="relative mt-2.5 flex items-center gap-2 text-[12.5px] text-ink-soft">
          {trend && (
            <span
              className="rounded-full px-2 py-0.5 font-mono font-medium"
              style={{ background: tBg, border: `1px solid ${tBd}`, color: tFg }}
            >
              {trend}
            </span>
          )}
          {note && <span>{note}</span>}
        </div>
      )}
    </GlassPanel>
  );
}
