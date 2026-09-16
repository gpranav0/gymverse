import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getMembers } from '../../services/memberService';
import { getErrorMessage } from '../../services/api';
import Select from '../ui/Select';

/**
 * Log a completed workout. A member logs their own; a trainer logs one for a client on
 * their roster (the members list is already scoped to the roster by the API).
 */
export default function WorkoutSessionForm({ plans = [], onSubmit, onCancel, loading }) {
  const { user } = useAuth();
  const forClient = user?.role !== 'member';

  const [members, setMembers] = useState([]);
  const [fetching, setFetching] = useState(forClient);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ member_id: '', workout_plan_id: '', duration_minutes: 45, calories_burned: '', completed: true, notes: '' });

  useEffect(() => {
    if (!forClient) return undefined;
    let active = true;
    getMembers({ limit: 1000 })
      .then((res) => { if (active) setMembers(res.data || []); })
      .catch((err) => { if (active) setLoadError(getErrorMessage(err, 'Failed to load members.')); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [forClient]);

  const setField = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      duration_minutes: parseInt(form.duration_minutes, 10),
      completed: form.completed,
      ...(forClient ? { member_id: parseInt(form.member_id, 10) } : {}),
      ...(form.workout_plan_id ? { workout_plan_id: parseInt(form.workout_plan_id, 10) } : {}),
      ...(form.calories_burned !== '' ? { calories_burned: parseFloat(form.calories_burned) } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    });
  };

  if (fetching) return <p className="p-4 text-center text-sm text-ink-muted">Loading your members…</p>;
  if (loadError) return <p className="p-4 text-center text-sm text-[#ffc2cc]">{loadError}</p>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {forClient && (
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Member</span>
          <Select required name="member_id" value={form.member_id} onChange={setField} className="text-sm">
            <option value="" disabled>-- Select a member --</option>
            {members.map((m) => <option key={m.member_id} value={m.member_id}>{m.member_name}</option>)}
          </Select>
          {members.length === 0 && <span className="text-xs text-ink-muted">No members are assigned to you yet.</span>}
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Workout plan (optional)</span>
        <Select name="workout_plan_id" value={form.workout_plan_id} onChange={setField} className="text-sm">
          <option value="">Free training</option>
          {plans.map((p) => <option key={p.workout_plan_id} value={p.workout_plan_id}>{p.plan_name}</option>)}
        </Select>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Duration (minutes)</span>
          <input required type="number" min="1" max="1440" name="duration_minutes" value={form.duration_minutes} onChange={setField} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Calories (optional)</span>
          <input type="number" min="0" step="0.1" name="calories_burned" value={form.calories_burned} onChange={setField} className="field text-sm" />
        </label>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-ink-soft">
        <input type="checkbox" name="completed" checked={form.completed} onChange={setField} className="h-4 w-4 accent-[var(--gv-accent)]" />
        Completed the full session
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Notes</span>
        <textarea name="notes" rows="2" value={form.notes} onChange={setField} className="field text-sm" placeholder="How did it go?" />
      </label>

      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={loading || (forClient && !form.member_id)} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Saving…' : 'Log session'}
        </button>
      </div>
    </form>
  );
}
