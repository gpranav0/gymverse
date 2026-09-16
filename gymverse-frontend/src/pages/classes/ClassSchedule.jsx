import { useState, useEffect, useCallback } from 'react';
import { getClassSchedules, enrollInClass } from '../../services/classService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtDate, fmtTime } from '../../utils/dates';
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { GlassPanel, Pill, ProgressBar } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, SuccessNote, EmptyState, LoadingCards } from '../../components/ui/States';

export default function ClassSchedule() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [enrollingId, setEnrollingId] = useState(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClassSchedules();
      setSchedules(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch class schedules.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleEnroll = async (schedule) => {
    setEnrollingId(schedule.schedule_id);
    setActionError(null);
    setNotice(null);
    try {
      await enrollInClass(schedule.schedule_id, user.member_id);
      setNotice(`You are booked on ${schedule.class_name}, ${fmtDate(schedule.class_date)} at ${fmtTime(schedule.start_time)}.`);
      fetchSchedules();
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to enroll.'));
      // A 409 means the seat count moved under us — refresh so the card reflects reality.
      if (err.response?.status === 409) fetchSchedules();
    } finally {
      setEnrollingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Class schedule" subtitle="Studio timetable — capacity fills live as members enrol" />

      {error && <ErrorNote>{error}</ErrorNote>}
      {actionError && <ErrorNote>{actionError}</ErrorNote>}
      {notice && <SuccessNote onDismiss={() => setNotice(null)}>{notice}</SuccessNote>}

      {loading ? (
        <LoadingCards count={6} />
      ) : schedules.length === 0 ? (
        <EmptyState>No classes scheduled currently.</EmptyState>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(272px,1fr))]">
          {schedules.map((schedule, i) => {
            const enrolled = parseInt(schedule.enrolled_count, 10) || 0;
            const capacity = schedule.capacity || 0;
            const isFull = capacity > 0 && enrolled >= capacity;
            const pct = capacity > 0 ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0;

            return (
              <GlassPanel
                key={schedule.schedule_id}
                delay={i * 70}
                hover
                className="relative flex flex-col gap-3.5 overflow-hidden p-5"
                style={isFull ? { borderColor: 'rgb(251 113 133 / .3)' } : undefined}
              >
                <div
                  className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-40 blur-[30px]"
                  style={{
                    background: isFull
                      ? 'radial-gradient(circle, rgb(251 113 133 / .7), transparent 68%)'
                      : 'radial-gradient(circle, rgb(52 211 153 / .7), transparent 68%)',
                  }}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-display text-[16px] font-semibold tracking-[-.2px]">
                      {schedule.class_name}
                    </div>
                    <div className="truncate text-[12.5px] text-ink-muted">{schedule.trainer_name}</div>
                  </div>
                  <Pill status={isFull ? 'failed' : 'active'}>{isFull ? 'FULL' : 'OPEN'}</Pill>
                </div>

                <div className="relative flex flex-col gap-2">
                  {[
                    [Calendar, fmtDate(schedule.class_date)],
                    [Clock, `${fmtTime(schedule.start_time)} – ${fmtTime(schedule.end_time)}`],
                    ...(schedule.room ? [[MapPin, schedule.room]] : []),
                    [Users, `${enrolled} / ${capacity} seats`],
                  ].map(([Icon, text], j) => (
                    <div key={j} className="flex items-center gap-2.5 font-mono text-[12.5px] text-ink-soft">
                      <Icon size={14} className="shrink-0" style={{ color: 'var(--gv-accent)' }} />
                      <span className="truncate">{text}</span>
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <ProgressBar
                    value={pct}
                    delay={i * 70}
                    fill={isFull ? 'linear-gradient(90deg, #fb7185, #ffc2cc)' : 'linear-gradient(90deg, #34d399, #6ee7b7)'}
                  />
                </div>

                <div className="relative mt-auto">
                  {user.role === 'member' && (
                    <button
                      onClick={() => handleEnroll(schedule)}
                      disabled={isFull || enrollingId === schedule.schedule_id}
                      className={isFull ? 'btn-ghost w-full cursor-not-allowed text-[13px] opacity-60' : 'btn-primary w-full text-[13px]'}
                    >
                      {enrollingId === schedule.schedule_id ? 'Enrolling…' : isFull ? 'Class full' : 'Enrol now'}
                    </button>
                  )}
                  {['admin', 'receptionist'].includes(user.role) && (
                    <div className="glass-inset px-3 py-2 text-center font-mono text-[12.5px] text-ink-soft">
                      {enrolled} / {capacity} enrolled
                    </div>
                  )}
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
