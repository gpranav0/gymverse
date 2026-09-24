import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import { getDashboardOverview, getRevenueData, getTrainerDashboard, getMemberDashboard } from '../../services/dashboardService';
import { getErrorMessage } from '../../services/api';
import { fmtDate, fmtTime, parseDate } from '../../utils/dates';
import StatCard from '../../components/ui/StatCard';
import { GlassPanel, Skeleton, Monogram, Pill, ProgressBar } from '../../components/ui/Glass';
import { Users, Activity, DollarSign, CalendarCheck, Dumbbell, ShieldCheck, CreditCard } from 'lucide-react';

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const roleIntro = {
  admin: { eyebrow: 'CLUB CONTROL', headline: 'Lead the club.', detail: 'Your people, operations, and performance at a glance.', actions: [['View reports', '/reports'], ['Manage classes', '/class-management']] },
  receptionist: { eyebrow: 'FRONT DESK', headline: 'Keep things moving.', detail: 'A clear view of the floor and the members who need you.', actions: [['Find members', '/members'], ['Check attendance', '/attendance']] },
  trainer: { eyebrow: 'COACHING SPACE', headline: 'Make every session count.', detail: 'Your roster, plans, and classes in one place.', actions: [['Open workouts', '/workouts'], ['View classes', '/classes']] },
  member: { eyebrow: 'YOUR TRAINING', headline: 'What will you do today?', detail: 'Your training, classes, and progress start here.', actions: [['My workouts', '/workouts'], ['Explore classes', '/classes']] },
};

/**
 * Role-aware dashboard. Every figure comes from the API; the trainer and member views
 * used to be hardcoded sample data (fixed counts, invented names and trends).
 *  admin        → revenue-forward: KPIs + 12-month chart
 *  receptionist → desk-forward: floor counts, renewals and payments to chase
 *  trainer      → roster-forward: my members + plan completion
 *  member       → progress-forward: visits, bookings, membership, plan progress
 */
export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role;
  const [overview, setOverview] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!role) return undefined;
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        // Independent requests, so they go out together rather than one after another.
        const [overviewRes, revenueRes, mineRes] = await Promise.all([
          ['admin', 'receptionist'].includes(role) ? getDashboardOverview() : null,
          role === 'admin' ? getRevenueData() : null,
          role === 'trainer' ? getTrainerDashboard() : role === 'member' ? getMemberDashboard() : null,
        ]);
        if (!active) return;
        if (overviewRes) setOverview(overviewRes.data);
        if (revenueRes) setRevenue(revenueRes.data || []);
        if (mineRes) setMine(mineRes.data);
      } catch (err) {
        if (active) setError(getErrorMessage(err, 'Failed to load dashboard metrics.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [role]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} />)}
        </div>
        <Skeleton height={320} />
      </div>
    );
  }

  if (error) {
    return (
      <GlassPanel className="p-5" style={{ borderColor: 'rgb(251 113 133 / .35)' }}>
        <p className="m-0 text-[#ffc2cc]">{error}</p>
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4.5">
      <section className="dashboard-welcome"><div><p>{roleIntro[role]?.eyebrow}</p><h1>{roleIntro[role]?.headline}</h1><span>{roleIntro[role]?.detail}</span><div className="dashboard-welcome-actions">{roleIntro[role]?.actions.map(([label, href]) => <Link key={href} to={href}>{label}</Link>)}</div></div></section>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {role === 'admin' && overview && (
          <>
            <StatCard title="Total members" count={overview.members.total} icon={Users} tone="blue"
              trend={`+${overview.members.joinedThisWeek}`} trendTone={overview.members.joinedThisWeek ? 'up' : 'flat'} note="joined this week" delay={0} />
            <StatCard title="Active members" count={overview.members.active} icon={Activity} tone="green"
              trend={`${pct(overview.members.active, overview.members.total)}%`} trendTone="flat" note="of total base" delay={80} />
            <StatCard title="Today's attendance" count={overview.attendance.today} icon={CalendarCheck} tone="violet"
              trend={String(overview.attendance.onFloor)} trendTone="flat" note="on the floor now" delay={160} />
            <StatCard title="Total revenue" count={Math.round(Number(overview.revenue.total))} prefix="$" icon={DollarSign} tone="amber"
              trend={String(overview.revenue.outstandingCount)} trendTone={overview.revenue.outstandingCount ? 'warn' : 'flat'} note="payments pending" delay={240} />
          </>
        )}

        {role === 'receptionist' && overview && (
          <>
            <StatCard title="Members on file" count={overview.members.total} icon={Users} tone="blue"
              trend={`+${overview.members.joinedThisWeek}`} trendTone={overview.members.joinedThisWeek ? 'up' : 'flat'} note="joined this week" delay={0} />
            <StatCard title="Checked in today" count={overview.attendance.today} icon={CalendarCheck} tone="green"
              trend={String(overview.attendance.onFloor)} trendTone="flat" note="on the floor now" delay={80} />
            <StatCard title="Expiring in 7 days" count={overview.members.expiring} icon={ShieldCheck} tone="amber"
              trend={overview.members.expiring ? 'Renewals' : 'None'} trendTone={overview.members.expiring ? 'warn' : 'flat'} note="memberships ending" delay={160} />
            <StatCard title="Payments to collect" count={overview.revenue.outstandingCount} icon={CreditCard} tone="violet"
              trend={overview.revenue.outstandingCount ? 'Pending' : 'Clear'} trendTone={overview.revenue.outstandingCount ? 'warn' : 'flat'} note="unpaid invoices" delay={240} />
          </>
        )}

        {role === 'trainer' && mine && (
          <>
            <StatCard title="Assigned members" count={mine.rosterCount} icon={Users} tone="blue" note="on your roster" delay={0} />
            <StatCard title="Classes today" count={mine.classesToday} icon={CalendarCheck} tone="violet" note="on the timetable" delay={80} />
            <StatCard title="Active plans" count={mine.activePlans} icon={Dumbbell} tone="green" note="authored by you" delay={160} />
            <StatCard title="Plan completion" value={`${mine.avgCompletion}%`} icon={Activity} tone="green"
              trend={String(mine.openAssignments)} trendTone="flat" note="open assignments" delay={240} />
          </>
        )}

        {role === 'member' && mine && (
          <>
            <StatCard title="Total visits" count={mine.totalVisits} icon={CalendarCheck} tone="blue"
              trend={String(mine.visits30d)} trendTone="flat" note="in the last 30 days" delay={0} />
            <StatCard title="Workout sessions" count={mine.sessions30d} icon={Activity} tone="green" note="logged in 30 days" delay={80} />
            <StatCard title="Classes booked" count={mine.upcomingClasses} icon={CalendarCheck} tone="violet"
              note={mine.nextClass ? `Next: ${mine.nextClass.class_name}, ${fmtDate(mine.nextClass.class_date)} ${fmtTime(mine.nextClass.start_time)}` : 'None upcoming'} delay={160} />
            {mine.subscription ? (
              <StatCard title="Days remaining" count={Math.max(0, mine.subscription.daysRemaining)} icon={ShieldCheck} tone="amber"
                note={`${mine.subscription.planName} · ends ${fmtDate(mine.subscription.endDate)}`} delay={240} />
            ) : (
              <StatCard title="Membership" value="—" icon={ShieldCheck} tone="amber" trend="Inactive" trendTone="warn" note="ask the front desk to renew" delay={240} />
            )}
          </>
        )}
      </div>

      {role === 'admin' && revenue.length > 0 && <RevenueChart data={revenue} />}

      {role === 'trainer' && mine && (
        <GlassPanel delay={260} className="px-[22px] py-5">
          <h2 className="m-0 mb-1 font-display text-[16.5px] font-semibold tracking-[-.2px]">My members</h2>
          <p className="m-0 mb-4 text-[12.5px] text-ink-muted">Your active roster, most recent visitors first</p>
          {mine.roster.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">No members are assigned to you yet. The front desk manages rosters.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {mine.roster.map((m, i) => (
                <div
                  key={m.member_id}
                  className="glass-inset flex items-center gap-3 px-3 py-2.5 transition-all hover:translate-x-[3px] hover:bg-white/8"
                  style={{ animation: 'var(--animate-rise-in)', animationDelay: `${i * 45}ms` }}
                >
                  <Monogram name={m.member_name} index={i} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{m.member_name}</div>
                    <div className="truncate text-xs text-ink-muted">
                      {m.plan_name || 'No active plan'} · {plural(m.visits, 'visit')}{m.last_visit ? ` · last ${fmtDate(m.last_visit)}` : ''}
                    </div>
                  </div>
                  <Pill status={m.status === 'active' ? 'active' : 'expired'}>{String(m.status).toUpperCase()}</Pill>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {role === 'member' && mine && (
        <GlassPanel delay={260} className="px-[22px] py-5">
          <h2 className="m-0 mb-1 font-display text-[16.5px] font-semibold tracking-[-.2px]">My progress</h2>
          <p className="m-0 mb-4.5 text-[12.5px] text-ink-muted">Workout plans assigned to you</p>
          {mine.workouts.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">No workout plan assigned yet. Ask your trainer to set one up.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {mine.workouts.map((w, i) => (
                <div key={w.member_workout_id} style={{ animation: 'var(--animate-rise-in)', animationDelay: `${i * 90}ms` }}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] font-semibold">{w.plan_name}</span>
                    <span className="font-mono text-[12.5px] text-ink-soft">{Math.round(w.completion_percentage)}%</span>
                  </div>
                  <ProgressBar value={w.completion_percentage} delay={i * 90} />
                  <div className="mt-1.5 text-[11.5px] text-ink-muted capitalize">
                    {w.trainer_name ? `Coach ${w.trainer_name}` : 'Self-guided'} · {String(w.status).replace('_', ' ')}
                    {w.end_date ? ` · target ${fmtDate(w.end_date)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  );
}

/** CSS-drawn bar chart with a staggered grow-in. */
function RevenueChart({ data }) {
  const max = Math.max(...data.map((d) => Number(d.revenue)));
  const total = data.reduce((a, d) => a + Number(d.revenue), 0);
  const label = (val) => parseDate(val).toLocaleDateString('default', { month: 'short' });

  return (
    <GlassPanel delay={180} className="px-6 py-5.5">
      <div className="mb-5.5 flex items-end justify-between gap-4">
        <div>
          <h2 className="m-0 mb-1 font-display text-lg font-semibold tracking-[-.3px]">Monthly revenue trend</h2>
          <p className="m-0 text-[13px] text-ink-soft">Last {plural(data.length, 'month')}, completed payments</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold tracking-[-.8px]">${total.toLocaleString('en-US')}</div>
          <div className="text-xs text-ink-muted">over this period</div>
        </div>
      </div>
      <div className="flex h-[230px] items-end gap-2.5 border-b border-white/10 pb-6.5">
        {data.map((d, i) => (
          <div key={d.month} className="relative flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="font-mono text-[11px] text-ink-soft">
              ${Math.round(Number(d.revenue) / 1000)}k
            </span>
            <div
              className="w-full origin-bottom rounded-t-[9px] rounded-b-[3px]"
              style={{
                height: `${(Number(d.revenue) / max) * 100}%`,
                background: 'linear-gradient(180deg, var(--gv-accent), color-mix(in oklab, var(--gv-accent) 35%, #0a1226))',
                boxShadow: '0 -6px 26px -8px var(--gv-accent), inset 0 1px 0 rgb(255 255 255 / .3)',
                animation: 'var(--animate-grow-bar)',
                animationDelay: `${i * 55}ms`,
              }}
              title={`${label(d.month)}: $${Number(d.revenue).toLocaleString('en-US')}`}
            />
            <span className="absolute -bottom-6 text-[11.5px] text-ink-muted">{label(d.month)}</span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
