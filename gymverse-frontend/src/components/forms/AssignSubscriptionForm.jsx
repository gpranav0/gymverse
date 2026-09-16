import { useState, useEffect } from 'react';
import { getMembers } from '../../services/memberService';
import { getErrorMessage } from '../../services/api';

export default function AssignSubscriptionForm({ plan, onSubmit, onCancel, loading }) {
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadMembers = async () => {
      try {
        const res = await getMembers({ limit: 1000 }); // fetch all for simple dropdown
        setMembers(res.data || []);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load members for dropdown.'));
      } finally {
        setFetching(false);
      }
    };
    loadMembers();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedMember) return;

    // The subscription API records the first payment, so it needs to know how it was paid.
    onSubmit({
      member_id: parseInt(selectedMember, 10),
      plan_id: plan.plan_id,
      payment_method: paymentMethod,
    });
  };

  if (fetching) return <p className="p-4 text-center text-sm text-ink-muted">Loading members…</p>;
  if (error) return <p className="p-4 text-center text-sm text-[#ffc2cc]">{error}</p>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="glass-inset px-4 py-3.5">
        <div className="label-caps m-0">Selected plan</div>
        <p className="m-0 mt-1 text-sm text-ink">{plan.plan_name} — ${parseFloat(plan.price).toFixed(2)}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Select member *</span>
        <select
          required
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

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Payment method *</span>
        <select required value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="field text-sm">
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="upi">UPI</option>
          <option value="bank_transfer">Bank transfer</option>
        </select>
      </label>

      <p className="m-0 text-xs text-ink-muted">
        Assigning a plan creates a new active subscription and records an initial payment automatically.
      </p>

      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={loading || !selectedMember} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Assigning…' : 'Assign plan'}
        </button>
      </div>
    </form>
  );
}
