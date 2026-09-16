import { useState, useEffect } from 'react';
import { getMembers } from '../../services/memberService';
import { getTrainers } from '../../services/trainerService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function AssignWorkoutForm({ plan, onSubmit, onCancel, loading }) {
  const { user } = useAuth();
  // A trainer assigns as themselves. An admin assigns on a trainer's behalf, and the API
  // requires assigned_by_trainer_id — without this picker every admin assignment failed.
  const needsTrainer = user?.role === 'admin';

  const [members, setMembers] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  // Default to the plan's author, which is who an admin is usually assigning for.
  const [selectedTrainer, setSelectedTrainer] = useState(plan?.trainer_id ? String(plan.trainer_id) : '');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [memberRes, trainerRes] = await Promise.all([
          getMembers({ limit: 1000 }),
          needsTrainer ? getTrainers({ limit: 200 }) : Promise.resolve(null),
        ]);
        if (!active) return;
        setMembers(memberRes.data || []);
        if (trainerRes) setTrainers((trainerRes.data || []).filter((t) => t.status === 'active'));
      } catch (err) {
        if (active) setError(getErrorMessage(err, 'Failed to load members.'));
      } finally {
        if (active) setFetching(false);
      }
    };
    load();
    return () => { active = false; };
  }, [needsTrainer]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedMember || (needsTrainer && !selectedTrainer)) return;

    onSubmit({
      member_id: selectedMember,
      workout_plan_id: plan.workout_plan_id,
      start_date: startDate,
      end_date: endDate || null,
      notes,
      ...(needsTrainer ? { assigned_by_trainer_id: parseInt(selectedTrainer, 10) } : {})
    });
  };

  if (fetching) return <p className="p-4 text-center text-sm text-ink-muted">Loading members…</p>;
  if (error) return <p className="p-4 text-center text-sm text-[#ffc2cc]">{error}</p>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="glass-inset px-4 py-3.5">
        <div className="label-caps m-0">Assigning workout plan</div>
        <p className="m-0 mt-1 text-sm text-ink">{plan.plan_name}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Select member *</span>
        <select
          required
          name="member_id"
          value={selectedMember}
          onChange={(e) => setSelectedMember(e.target.value)}
          className="field text-sm"
        >
          <option value="" disabled>-- Select a member --</option>
          {members.map(m => (
            <option key={m.member_id} value={m.member_id}>
              {m.member_name} ({m.email})
            </option>
          ))}
        </select>
      </label>

      {needsTrainer && (
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Assigned by trainer *</span>
          <select
            required
            name="assigned_by_trainer_id"
            value={selectedTrainer}
            onChange={(e) => setSelectedTrainer(e.target.value)}
            className="field text-sm"
          >
            <option value="" disabled>-- Select a trainer --</option>
            {trainers.map((t) => (
              <option key={t.trainer_id} value={t.trainer_id}>{t.trainer_name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Start date *</span>
          <input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Target end date</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="field text-sm" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Trainer notes</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows="3" className="field text-sm" />
      </label>

      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={loading || !selectedMember || (needsTrainer && !selectedTrainer)} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Assigning…' : 'Assign workout'}
        </button>
      </div>
    </form>
  );
}
