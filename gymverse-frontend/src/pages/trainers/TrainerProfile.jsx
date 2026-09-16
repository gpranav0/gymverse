import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTrainerById } from '../../services/trainerService';
import api, { getErrorMessage } from '../../services/api';
import { fmtDate, fmtTime } from '../../utils/dates';
import { Award, Calendar, Mail, Phone } from 'lucide-react';
import { GlassPanel, Pill, Skeleton } from '../../components/ui/Glass';
import { ErrorNote } from '../../components/ui/States';

export default function TrainerProfile() {
  const { id } = useParams();
  const [trainer, setTrainer] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTrainer = async () => {
      try {
        setLoading(true);
        setError(null);
        // Upcoming classes were a hardcoded placeholder. /schedules already returns
        // future schedules with trainer names, so filter it down to this trainer. Both
        // requests go out together; a schedule failure just leaves the list empty.
        const [res, sched] = await Promise.all([
          getTrainerById(id),
          api.get('/schedules', { params: { limit: 200 } }).catch(() => null),
        ]);
        setTrainer(res.data);
        setClasses((sched?.data.data || []).filter((c) => String(c.trainer_id) === String(id)));
      } catch (err) {
        setError(getErrorMessage(err, 'Trainer not found.'));
      } finally {
        setLoading(false);
      }
    };
    fetchTrainer();
  }, [id]);

  if (loading) {
    return (
      <div className="grid gap-4 [grid-template-columns:minmax(0,320px)_minmax(0,1fr)]">
        <Skeleton height={420} />
        <div className="flex flex-col gap-4">
          <Skeleton height={140} />
          <Skeleton height={220} />
        </div>
      </div>
    );
  }

  if (error || !trainer) return <ErrorNote>{error || 'Trainer not found.'}</ErrorNote>;

  const initials = (trainer.trainer_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const details = [
    { label: 'Experience', value: `${trainer.experience_years || 0} yrs`, icon: Award },
    ...(trainer.phone ? [{ label: 'Phone', value: trainer.phone, icon: Phone }] : []),
    ...(trainer.email ? [{ label: 'Email', value: trainer.email, icon: Mail }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link to="/trainers" className="btn-ghost inline-flex w-fit items-center text-[13px] no-underline">
        &larr; Back to trainers
      </Link>

      <div className="grid gap-4 [grid-template-columns:minmax(0,320px)_minmax(0,1fr)] max-lg:[grid-template-columns:minmax(0,1fr)]">
        <GlassPanel className="relative overflow-hidden p-6">
          <div
            className="absolute -top-12 -right-12 h-44 w-44 rounded-full opacity-40 blur-[38px]"
            style={{ background: 'radial-gradient(circle, var(--gv-accent), transparent 68%)' }}
          />
          <div className="relative flex flex-col items-center gap-3 text-center">
            {trainer.profile_photo_url ? (
              <img
                src={trainer.profile_photo_url}
                alt={trainer.trainer_name}
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
              <div className="font-display text-[21px] font-bold tracking-[-.5px]">{trainer.trainer_name}</div>
              <div className="mt-1 text-[13px] text-ink-soft">{trainer.specialization || 'General Fitness'}</div>
            </div>
            <Pill status={trainer.status === 'active' ? 'active' : 'expired'}>
              {(trainer.status || 'unknown').toUpperCase()}
            </Pill>
          </div>

          {trainer.bio && (
            <p className="relative m-0 mt-5 text-[13px] leading-relaxed text-ink-soft">{trainer.bio}</p>
          )}

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
              <Calendar size={18} style={{ color: 'var(--gv-accent)' }} />
              <h3 className="m-0 font-display text-[16.5px] font-semibold tracking-[-.2px]">Upcoming classes</h3>
            </div>
            {classes.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {classes.map((c) => (
                  <div key={c.schedule_id} className="glass-inset flex items-center justify-between gap-3 px-3.5 py-3">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{c.class_name}</span>
                    <span className="shrink-0 font-mono text-[12.5px] text-ink-muted">
                      {fmtDate(c.class_date)} · {fmtTime(c.start_time)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm text-ink-muted">No upcoming classes scheduled.</p>
            )}
          </GlassPanel>

          <GlassPanel delay={160} className="px-[22px] py-5">
            <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Award size={18} style={{ color: 'var(--gv-accent)' }} />
              <h3 className="m-0 font-display text-[16.5px] font-semibold tracking-[-.2px]">Qualifications</h3>
            </div>
            <dl className="m-0 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              {[
                ['Specialization', trainer.specialization || '—'],
                ['Certification', trainer.qualification || '—'],
                ['Shift', trainer.shift || '—'],
                ['Code', trainer.trainer_code],
              ].map(([label, value]) => (
                <div key={label} className="glass-inset px-3.5 py-3">
                  <dt className="label-caps m-0">{label}</dt>
                  <dd className="m-0 mt-1.5 truncate font-mono text-[13px] text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
