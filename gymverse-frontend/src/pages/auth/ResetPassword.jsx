import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../services/accountService';
import { getErrorMessage } from '../../services/api';
import { passwordProblem } from '../../utils/passwordPolicy';
import AuthShell, { AuthAlert } from '../../components/ui/AuthShell';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  if (!token) {
    return (
      <AuthShell title="Reset your password">
        <AuthAlert>This page needs the link from your password-reset email.</AuthAlert>
        <p className="m-0 text-center text-[13px] text-ink-muted">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </AuthShell>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('Passwords do not match');
    const problem = passwordProblem(password);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      const res = await resetPassword(token, password);
      setDone(res.message || 'Password updated. You can now sign in.');
    } catch (err) {
      setError(getErrorMessage(err, 'This reset link is invalid or has expired. Request a new one.'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated">
        <AuthAlert tone="success">{done}</AuthAlert>
        <p className="m-0 text-[13px] text-ink-muted">For your security, every device signed in to this account has been signed out.</p>
        <Link to="/login" className="btn-primary mt-5 flex justify-center py-3.5 text-sm no-underline" style={{ color: '#04070f' }}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  const linkExpired = /invalid or has expired/i.test(error || '');

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters, with a letter and a number.">
      {error && (
        <AuthAlert>
          {error}
          {linkExpired && <> <Link to="/forgot-password">Request a new link</Link></>}
        </AuthAlert>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">New password</span>
          <input type="password" name="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field text-sm" autoComplete="new-password" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Confirm new password</span>
          <input type="password" name="confirmPassword" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field text-sm" autoComplete="new-password" />
        </label>
        <button type="submit" disabled={busy} className="btn-primary mt-2 py-3.5 text-sm disabled:opacity-60">
          {busy ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </AuthShell>
  );
}
