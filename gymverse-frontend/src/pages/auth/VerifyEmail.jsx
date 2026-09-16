import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail, resendVerification } from '../../services/accountService';
import { getErrorMessage } from '../../services/api';
import AuthShell, { AuthAlert } from '../../components/ui/AuthShell';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState(token ? 'verifying' : 'resend');
  const [message, setMessage] = useState(null);
  const [email, setEmail] = useState(params.get('email') || '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  // A link works once. React's development double-invocation of effects would otherwise
  // spend it on the first call and report the second as "expired".
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then((res) => { setState('done'); setMessage(res.message); })
      .catch((err) => {
        setState('resend');
        setMessage(getErrorMessage(err, 'This confirmation link is invalid or has expired.'));
      });
  }, [token]);

  const handleResend = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await resendVerification(email.trim());
      setSent(res.message);
    } catch (err) {
      setMessage(getErrorMessage(err, 'Could not send a new link. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'verifying') {
    return (
      <AuthShell title="Confirming your email">
        <p className="m-0 text-sm text-ink-soft">One moment…</p>
      </AuthShell>
    );
  }

  if (state === 'done') {
    return (
      <AuthShell title="Email confirmed">
        <AuthAlert tone="success">{message || 'Email address confirmed.'}</AuthAlert>
        <Link to="/login" className="btn-primary mt-2 flex justify-center py-3.5 text-sm no-underline" style={{ color: '#04070f' }}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Confirm your email" subtitle="Enter your account email and we will send a fresh confirmation link.">
      {message && <AuthAlert>{message}</AuthAlert>}
      {sent ? (
        <>
          <AuthAlert tone="success">{sent}</AuthAlert>
          <p className="m-0 text-center text-[13px] text-ink-muted"><Link to="/login">Back to sign in</Link></p>
        </>
      ) : (
        <form onSubmit={handleResend} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Email</span>
            <input type="email" name="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field text-sm" autoComplete="email" />
          </label>
          <button type="submit" disabled={busy} className="btn-primary mt-2 py-3.5 text-sm disabled:opacity-60">
            {busy ? 'Sending…' : 'Send confirmation link'}
          </button>
          <p className="m-0 mt-1.5 text-center text-[13px] text-ink-muted"><Link to="/login">Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
