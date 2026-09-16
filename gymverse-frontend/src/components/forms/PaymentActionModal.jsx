import { useState, useEffect } from 'react';
import { fmtDate } from '../../utils/dates';

export default function PaymentActionModal({ payment, onSubmit, onCancel, loading }) {
  const [status, setStatus] = useState('pending');

  useEffect(() => {
    if (payment) {
      setStatus(payment.payment_status);
    }
  }, [payment]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ payment_status: status });
  };

  if (!payment) return null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="glass-inset grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3.5 text-sm">
        <div className="label-caps m-0">Payment ID</div>
        <div className="text-right font-mono text-ink">#{payment.payment_id}</div>
        <div className="label-caps m-0">Amount</div>
        <div className="text-right font-mono text-ink">${parseFloat(payment.amount).toFixed(2)}</div>
        <div className="label-caps m-0">Date</div>
        <div className="text-right font-mono text-ink">{fmtDate(payment.payment_date)}</div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Update status</span>
        {/* Every PAYMENT_STATUSES value the API accepts; a missing one rendered a blank select. */}
        <select
          required
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="field text-sm"
        >
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="partially_refunded">Partially refunded</option>
        </select>
      </label>

      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Updating…' : 'Update status'}
        </button>
      </div>
    </form>
  );
}
