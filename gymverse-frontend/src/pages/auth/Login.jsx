import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../services/api';
import AuthShell, { AuthAlert } from '../../components/ui/AuthShell';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in. Check your credentials.'));
    } finally {
      setBusy(false);
    }
  };

  // Shown when email confirmation is required and this account has not confirmed yet.
  const needsConfirmation = /confirm your email/i.test(error || '');

  return (
    <AuthShell title="Welcome back" subtitle="Sign in and pick up right where you left off.">
      <form onSubmit={handleSubmit}>
        {error && (
          <AuthAlert>
            {error}
            {needsConfirmation && (
              <>
                {' '}
                <Link to={`/verify-email?email=${encodeURIComponent(email)}`}>Send a new confirmation email</Link>
              </>
            )}
          </AuthAlert>
        )}

        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field text-sm"
              placeholder="you@gymverse.io"
              autoComplete="email"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between gap-3">
              <span className="label-caps">Password</span>
              <Link to="/forgot-password" className="text-[12.5px]">Forgot password?</Link>
            </span>
            <span className="relative flex"><input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field w-full pr-12 text-sm"
              placeholder="••••••••"
              autoComplete="current-password"
            /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></span>
          </label>

          <button type="submit" disabled={busy} className="btn-primary mt-3 py-3.5 text-sm disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="m-0 mt-1.5 text-center text-[13px] text-ink-muted">
            No account? <Link to="/register">Request access</Link>
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
