import { useEffect, useState } from 'react';
import { getMembers } from '../../services/memberService';
import { getTrainers } from '../../services/trainerService';
import { getErrorMessage } from '../../services/api';
import { todayLocal } from '../../utils/dates';

export default function TrainerAssignmentForm({ onSubmit, onCancel, loading }) {
  const [members, setMembers] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ member_id: '', trainer_id: '', start_date: todayLocal(), end_date: '', notes: '' });

  useEffect(() => {
    let active = true;
    Promise.all([getMembers({ limit: 1000 }), getTrainers({ limit: 200 })])
      .then(([memberRes, trainerRes]) => {
        if (!active) return;
        setMembers(memberRes.data || []);
        // Only active trainers can take on members; the API refuses the rest.
        setTrainers((trainerRes.data || []).filter((t) => t.status === 'active'));
      })
      .catch((err) => { if (active) setError(getErrorMessage(err, 'Failed to load members and trainers.')); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, []);

  const setField = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.end_date && form.end_date < form.start_date) {
      setError('End date must be on or after the start date');
      return;
    }
    setError(null);
    onSubmit({
      member_id: parseInt(form.member_id, 10),
      trainer_id: parseInt(form.trainer_id, 10),
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  if (fetching) return <p className="p-4 text-center text-sm text-ink-muted">Loading members and trainers…</p>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p role="alert" className="m-0 text-sm text-[#ffc2cc]">{error}</p>}

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Member</span>
        <select required name="member_id" value={form.member_id} onChange={setField} className="field text-sm">
          <option value="" disabled>-- Select a member --</option>
          {members.map((m) => (
            <option key={m.member_id} value={m.member_id}>{m.member_name} ({m.email})</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Trainer</span>
        <select required name="trainer_id" value={form.trainer_id} onChange={setField} className="field text-sm">
          <option value="" disabled>-- Select a trainer --</option>
          {trainers.map((t) => (
            <option key={t.trainer_id} value={t.trainer_id}>
              {t.trainer_name}{t.specialization ? ` — ${t.specialization}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Start date</span>
          <input required type="date" name="start_date" value={form.start_date} onChange={setField} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">End date (optional)</span>
          <input type="date" name="end_date" value={form.end_date} min={form.start_date} onChange={setField} className="field text-sm" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Notes</span>
        <textarea name="notes" rows="2" value={form.notes} onChange={setField} className="field text-sm" placeholder="Goals or schedule for this client" />
      </label>

      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={loading || !form.member_id || !form.trainer_id} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Saving…' : 'Save assignment'}
        </button>
      </div>
    </form>
  );
}
