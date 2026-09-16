import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMemberById } from '../../services/memberService';
import api, { getErrorMessage } from '../../services/api';
import { Activity, Calendar, Mail, Phone } from 'lucide-react';
import { GlassPanel, Pill, Skeleton } from '../../components/ui/Glass';
import { ErrorNote } from '../../components/ui/States';
import { fmtDate } from '../../utils/dates';

export default function MemberProfile() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMember = async () => {
      try {
        setLoading(true);
        setError(null);
        // All three requests at once; the side panels degrade to empty on failure. The page
        // shows five recent visits, so it asks for five rather than two hundred.
        const [res, subs, att] = await Promise.all([
          getMemberById(id),
          api.get(`/subscriptions/member/${id}`, { params: { limit: 50 } }).catch(() => null),
          api.get(`/attendance/member/${id}`, { params: { limit: 5 } }).catch(() => null),
        ]);
        setMember(res.data);
        setSubscriptions(subs?.data.data || []);
        setAttendance(att?.data.data || []);
      } catch (err) {
        setError(getErrorMessage(err, 'Member not found.'));
      } finally {
        setLoading(false);
      }
    };
    fetchMember();
  }, [id]);

  if (loading) {
    return (
      <div className="grid gap-4 [grid-template-columns:minmax(0,320px)_minmax(0,1fr)]">
        <Skeleton height={420} />
        <div className="flex flex-col gap-4">
          <Skeleton height={120} />
          <Skeleton height={284} />
        </div>
      </div>
    );
  }

  if (error || !member) return <ErrorNote>{error || 'Member not found.'}</ErrorNote>;

  const activeSub = subscriptions.find((s) => s.subscription_status === 'active');
  const recentVisits = attendance.slice(0, 5);
  const initials = (member.member_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const details = [
    { label: 'Email', value: member.email, icon: Mail },
    { label: 'Phone', value: member.phone || '—', icon: Phone },
    { label: 'Joined', value: fmtDate(member.join_date), icon: Calendar },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link to="/members" className="btn-ghost inline-flex w-fit items-center text-[13px] no-underline">
        &larr; Back to members
      </Link>

      <div className="grid gap-4 [grid-template-columns:minmax(0,320px)_minmax(0,1fr)] max-lg:[grid-template-columns:minmax(0,1fr)]">
        <GlassPanel className="relative overflow-hidden p-6">
          <div
            className="absolute -top-12 -right-12 h-44 w-44 rounded-full opacity-40 blur-[38px]"
            style={{ background: 'radial-gradient(circle, var(--gv-accent), transparent 68%)' }}
          />
          <div className="relative flex flex-col items-center gap-3 text-center">
            {member.profile_photo_url ? (
              <img
                src={member.profile_photo_url}
                alt={member.member_name}
                className="h-[78px] w-[78px] rounded-3xl border border-white/16 object-cover"
              />
            ) : (
              <div
                className="grid h-[78px] w-[78px] place-items-center rounded-3xl font-display text-[26px] font-bold text-[#04070f]"
                style={{
                  background: 'linear-gradient(150deg, var(--gv-accent), #8ab6ff)',
                  boxShadow: '0 18px 40px -14px var(--gv-accent)',
                }}
              >
                {initials}
              </div>
            )}
            <div>
              <div className="font-display text-[21px] font-bold tracking-[-.5px]">{member.member_name}</div>
              <div className="mt-1 text-[13px] text-ink-soft">{member.email}</div>
            </div>
            <Pill status={member.status === 'active' ? 'active' : 'expired'}>
              {(member.status || 'unknown').toUpperCase()}
            </Pill>
          </div>

          <div className="relative mt-6 flex flex-col gap-2.5">
            {details.map((d) => (
              <div key={d.label} className="glass-inset flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                  <d.icon size={14} /> {d.label}
                </span>
                <span className="truncate font-mono text-[12.5px] text-ink">{d.value}</span>
              </div>
            ))}
          </div>
        </GlassPanel>

        <div className="flex min-w-0 flex-col gap-4">
          <GlassPanel delay={80} className="px-[22px] py-5">
            <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Activity size={18} style={{ color: 'var(--gv-accent)' }} />
              <h3 className="m-0 font-display text-[16.5px] font-semibold tracking-[-.2px]">Membership &amp; billing</h3>
            </div>
            {activeSub ? (
              <dl className="m-0 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                {[
                  ['Plan', activeSub.plan_name || `Plan ${activeSub.plan_id}`],
                  ['Started', fmtDate(activeSub.start_date)],
                  ['Renews / expires', fmtDate(activeSub.end_date)],
                ].map(([label, value]) => (
                  <div key={label} className="glass-inset px-3.5 py-3">
                    <dt className="label-caps m-0">{label}</dt>
                    <dd className="m-0 mt-1.5 font-mono text-[13px] text-ink">{value}</dd>
                  </div>
                ))}
                <div className="glass-inset px-3.5 py-3">
                  <dt className="label-caps m-0">Status</dt>
                  <dd className="m-0 mt-1.5"><Pill status="active">ACTIVE</Pill></dd>
                </div>
              </dl>
            ) : (
              <p className="m-0 text-sm text-ink-muted">
                {subscriptions.length > 0
                  ? 'No active subscription. This member has past subscriptions on record.'
                  : 'No subscription on record.'}
              </p>
            )}
          </GlassPanel>

          <GlassPanel delay={160} className="px-[22px] py-5">
            <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Calendar size={18} style={{ color: 'var(--gv-accent)' }} />
              <h3 className="m-0 font-display text-[16.5px] font-semibold tracking-[-.2px]">Recent activity</h3>
            </div>
            {recentVisits.length > 0 ? (
              <div className="flex flex-col">
                {recentVisits.map((visit, i) => (
                  <div
                    key={visit.attendance_id}
                    className="flex gap-3.5"
                    style={{ animation: 'var(--animate-rise-in)', animationDelay: `${i * 70}ms` }}
                  >
                    <div className="flex w-3 shrink-0 flex-col items-center">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 rounded-full"
                        style={{
                          background: visit.check_out_time ? '#34d399' : '#fbbf24',
                          boxShadow: '0 0 0 4px rgb(255 255 255 / .05)',
                        }}
                      />
                      {i < recentVisits.length - 1 && <span className="w-px flex-1 bg-white/12" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="text-[13.5px] font-semibold text-ink">
                        {fmtDate(visit.attendance_date)}
                      </div>
                      <div className="mt-0.5 font-mono text-[12.5px] text-ink-muted">
                        {visit.check_in_time}
                        {visit.check_out_time ? ` – ${visit.check_out_time}` : ' · still in gym'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm text-ink-muted">No recent activity recorded.</p>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
