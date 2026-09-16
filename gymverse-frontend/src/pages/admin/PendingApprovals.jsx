import { useState, useEffect, useCallback } from 'react';
import api, { getErrorMessage } from '../../services/api';
import { fmtDate } from '../../utils/dates';
import { GlassPanel, Monogram, Pill } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, EmptyState, LoadingCards } from '../../components/ui/States';

export default function PendingApprovals() {
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPendingTrainers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/users/pending-trainers');
      setTrainers(res.data.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load pending approvals'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingTrainers();
  }, [fetchPendingTrainers]);

  const review = async (userId, action) => {
    if (!window.confirm(`Are you sure you want to ${action} this trainer?`)) return;
    setError(null);
    try {
      await api.patch(`/admin/users/${userId}/${action}`);
      setTrainers((prev) => prev.filter((t) => t.user_id !== userId));
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} the trainer.`));
    }
  };

  const handleApprove = (userId) => review(userId, 'approve');
  const handleReject = (userId) => review(userId, 'reject');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Pending trainer approvals" subtitle="Approve to grant console access, reject to archive" />

      {error && <ErrorNote>{error}</ErrorNote>}

      {!loading && trainers.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-[18px] px-4.5 py-4"
          style={{
            background: 'linear-gradient(155deg, rgb(251 191 36 / .14), rgb(255 255 255 / .03))',
            border: '1px solid rgb(251 191 36 / .3)',
            backdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
            WebkitBackdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
            animation: 'var(--animate-rise-in)',
          }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: '#fbbf24', animation: 'pulseDot 1.8s ease-in-out infinite' }}
          />
          <span className="text-sm font-semibold" style={{ color: '#ffe9b0' }}>
            {trainers.length} {trainers.length === 1 ? 'account' : 'accounts'} awaiting review
          </span>
        </div>
      )}

      {loading ? (
        <LoadingCards count={4} height={230} />
      ) : trainers.length === 0 ? (
        <EmptyState>No pending trainers to approve at this time.</EmptyState>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {trainers.map((trainer, i) => (
            <GlassPanel key={trainer.user_id} delay={i * 80} hover className="flex flex-col gap-3.5 p-5">
              <div className="flex items-center gap-3.5">
                <Monogram name={trainer.trainer_name || trainer.username} index={i} size={46} radius={14} />
                <div className="min-w-0">
                  <div className="truncate font-display text-[16px] font-semibold tracking-[-.2px]">
                    {trainer.trainer_name}
                  </div>
                  <div className="truncate text-[12.5px] text-ink-muted">{trainer.email}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Pill status="on floor">{trainer.username}</Pill>
                <Pill status="neutral">Reg {fmtDate(trainer.created_at)}</Pill>
              </div>

              <div className="glass-inset flex flex-col gap-1.5 px-3.5 py-3">
                <div className="flex justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-muted">Specialization</span>
                  <span className="truncate text-ink">{trainer.specialization || '—'}</span>
                </div>
                <div className="flex justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-muted">Qualification</span>
                  <span className="truncate text-ink">{trainer.qualification || '—'}</span>
                </div>
              </div>

              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => handleApprove(trainer.user_id)}
                  className="flex-1 rounded-[11px] border-none py-2.5 text-[13px] font-bold transition-transform hover:-translate-y-0.5"
                  style={{
                    color: '#04140c',
                    background: 'linear-gradient(140deg, #34d399, #6ee7b7)',
                    boxShadow: '0 14px 30px -14px rgb(52 211 153 / .8)',
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(trainer.user_id)}
                  className="rounded-[11px] px-4 py-2.5 text-[13px] font-semibold transition-colors"
                  style={{
                    color: '#ffd5db',
                    background: 'rgb(251 113 133 / .14)',
                    border: '1px solid rgb(251 113 133 / .36)',
                  }}
                >
                  Reject
                </button>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
