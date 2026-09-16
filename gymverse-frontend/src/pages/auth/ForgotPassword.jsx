import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../services/accountService';
import { getErrorMessage } from '../../services/api';
import AuthShell, { AuthAlert } from '../../components/ui/AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await forgotPassword(email.trim());
      setSent(res.message);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send the reset link. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Enter the email on your account and we will send you a link to choose a new password.">
      {error && <AuthAlert>{error}</AuthAlert>}

      {sent ? (
        <>
          <AuthAlert tone="success">{sent}</AuthAlert>
          <p className="m-0 text-center text-[13px] text-ink-muted">
            The link works once and expires after 30 minutes. <Link to="/login">Back to sign in</Link>
          </p>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Email</span>
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field text-sm"
              placeholder="you@gymverse.io"
              autoComplete="email"
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary mt-2 py-3.5 text-sm disabled:opacity-60">
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="m-0 mt-1.5 text-center text-[13px] text-ink-muted">
            <Link to="/login">Back to sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
