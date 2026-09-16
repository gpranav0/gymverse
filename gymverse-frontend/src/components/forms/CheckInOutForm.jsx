import { useState, useEffect } from 'react';
import { getMembers } from '../../services/memberService';
import { getErrorMessage } from '../../services/api';
import Select from '../ui/Select';

export default function CheckInOutForm({ onAction, onCancel, loading }) {
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadMembers = async () => {
      try {
        const res = await getMembers({ limit: 1000 });
        setMembers(res.data || []);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load members.'));
      } finally {
        setFetching(false);
      }
    };
    loadMembers();
  }, []);

  if (fetching) return <p className="p-4 text-center text-sm text-ink-muted">Loading members…</p>;
  if (error) return <p className="p-4 text-center text-sm text-[#ffc2cc]">{error}</p>;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Select member *</span>
        <Select
          required
          value={selectedMember}
          onChange={(e) => setSelectedMember(e.target.value)}
          className="text-sm"
        >
          <option value="" disabled>-- Select a member --</option>
          {members.map(m => (
            <option key={m.member_id} value={m.member_id}>
              {m.member_name} ({m.email})
            </option>
          ))}
        </Select>
      </label>

      <div className="mt-2 flex justify-between gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
          Cancel
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAction('out', selectedMember)}
            disabled={loading || !selectedMember}
            className="rounded-[11px] border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ color: '#ffc2cc', background: 'rgb(251 113 133 / .12)', borderColor: 'rgb(251 113 133 / .3)' }}
          >
            Check out
          </button>
          <button
            type="button"
            onClick={() => onAction('in', selectedMember)}
            disabled={loading || !selectedMember}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Check in
          </button>
        </div>
      </div>
    </div>
  );
}
